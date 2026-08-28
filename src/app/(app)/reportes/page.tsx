'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, FileSpreadsheet } from 'lucide-react';
import { listPurchaseOrders } from '@/lib/actions/purchase-orders';
import { listMyRequisitions } from '@/lib/actions/requisitions';
import { listSuppliers } from '@/lib/actions/suppliers';
import { useEstablishmentStore } from '@/lib/store/establishment';
import { exportToCsv, exportToXlsx } from '@/lib/export';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/business/StatusBadge';
import { CurrencyDisplay, DateTimeDisplay } from '@/components/business/DisplayFormatters';
import { getPurchaseOrderStatusMeta, getRequisitionStatusMeta } from '@/lib/status';
import { cn } from '@/lib/utils';

type ReportType = 'compras' | 'requerimientos';

export default function ReportesPage() {
  const { activeEstablishmentId } = useEstablishmentStore();
  const [reportType, setReportType] = useState<ReportType>('compras');
  const [statusFilter, setStatusFilter] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const suppliers = useQuery({ queryKey: ['suppliers'], queryFn: () => listSuppliers() });

  const orders = useQuery({
    queryKey: ['purchase-orders', activeEstablishmentId],
    queryFn: () => listPurchaseOrders(activeEstablishmentId!),
    enabled: !!activeEstablishmentId && reportType === 'compras',
  });
  const requisitions = useQuery({
    queryKey: ['my-requisitions', activeEstablishmentId],
    queryFn: () => listMyRequisitions(activeEstablishmentId!),
    enabled: !!activeEstablishmentId && reportType === 'requerimientos',
  });

  const filteredOrders = useMemo(() => {
    if (!orders.data) return [];
    return orders.data.filter((o: any) => {
      if (statusFilter && o.status !== statusFilter) return false;
      if (supplierFilter && o.supplier_id !== supplierFilter) return false;
      if (dateFrom && new Date(o.created_at) < new Date(dateFrom)) return false;
      if (dateTo && new Date(o.created_at) > new Date(dateTo)) return false;
      return true;
    });
  }, [orders.data, statusFilter, supplierFilter, dateFrom, dateTo]);

  const filteredRequisitions = useMemo(() => {
    if (!requisitions.data) return [];
    return requisitions.data.filter((r: any) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (dateFrom && new Date(r.created_at) < new Date(dateFrom)) return false;
      if (dateTo && new Date(r.created_at) > new Date(dateTo)) return false;
      return true;
    });
  }, [requisitions.data, statusFilter, dateFrom, dateTo]);

  function buildExportRows() {
    if (reportType === 'compras') {
      return filteredOrders.map((o: any) => ({
        codigo: o.code, proveedor: o.supplier?.trade_name ?? '', estado: o.status,
        total: o.total, fecha: o.created_at?.slice(0, 10), entrega_esperada: o.expected_delivery_date ?? '',
      }));
    }
    return filteredRequisitions.map((r: any) => ({
      codigo: r.code, area: r.area?.name ?? '', estado: r.status,
      productos: r.requisition_items?.length ?? 0, fecha: r.created_at?.slice(0, 10),
    }));
  }

  const isLoading = reportType === 'compras' ? orders.isLoading : requisitions.isLoading;
  const rows = reportType === 'compras' ? filteredOrders : filteredRequisitions;
  const statusOptions = reportType === 'compras'
    ? ['orden_generada', 'recibida_totalmente', 'con_novedad', 'conciliada', 'cerrada', 'cancelada']
    : ['enviado', 'en_orden', 'cerrado', 'cancelado'];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">Reportes</h1>
        <p className="text-sm text-muted-foreground">Filtra y exporta — respeta lo que ves en pantalla</p>
      </div>

      <div className="flex gap-1 rounded-md border border-border p-0.5 w-fit">
        {(['compras', 'requerimientos'] as ReportType[]).map((t) => (
          <button
            key={t}
            onClick={() => { setReportType(t); setStatusFilter(''); setSupplierFilter(''); }}
            className={cn('rounded px-3.5 py-1.5 text-sm font-medium capitalize', reportType === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent')}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-sm">
          <option value="">Todos los estados</option>
          {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {reportType === 'compras' && (
          <select value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-sm">
            <option value="">Todos los proveedores</option>
            {suppliers.data?.map((s: any) => <option key={s.id} value={s.id}>{s.trade_name ?? s.legal_name}</option>)}
          </select>
        )}
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-sm" />
        <span className="text-muted-foreground text-sm">a</span>
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 rounded-md border border-input bg-card px-2 text-sm" />

        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => exportToCsv(`reporte-${reportType}`, buildExportRows())}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={() => exportToXlsx(`reporte-${reportType}`, buildExportRows())}>
            <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-10">Sin resultados para estos filtros.</p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {reportType === 'compras'
            ? filteredOrders.map((o: any) => {
                const meta = getPurchaseOrderStatusMeta(o.status);
                return (
                  <div key={o.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-3 px-4 py-3 border-b border-border last:border-0 bg-card text-sm">
                    <div className="flex items-center justify-between sm:contents">
                      <span className="font-medium">{o.code}</span>
                      <StatusBadge label={meta.label} color={meta.color} icon={meta.icon} />
                    </div>
                    <span className="text-muted-foreground">{o.supplier?.trade_name}</span>
                    <div className="flex items-center justify-between sm:contents text-muted-foreground">
                      <DateTimeDisplay value={o.created_at} mode="date" />
                      <CurrencyDisplay value={o.total} className="text-foreground" />
                    </div>
                  </div>
                );
              })
            : filteredRequisitions.map((r: any) => {
                const meta = getRequisitionStatusMeta(r.status);
                return (
                  <div key={r.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-3 px-4 py-3 border-b border-border last:border-0 bg-card text-sm">
                    <div className="flex items-center justify-between sm:contents">
                      <span className="font-medium">{r.code}</span>
                      <StatusBadge label={meta.label} color={meta.color} icon={meta.icon} />
                    </div>
                    <span className="text-muted-foreground">{r.area?.name}</span>
                    <div className="flex items-center justify-between sm:contents text-muted-foreground">
                      <DateTimeDisplay value={r.created_at} mode="date" />
                      <span>{r.requisition_items?.length ?? 0} producto(s)</span>
                    </div>
                  </div>
                );
              })}
        </div>
      )}
    </div>
  );
}
