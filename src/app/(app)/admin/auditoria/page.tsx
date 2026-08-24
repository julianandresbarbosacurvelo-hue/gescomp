'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listAuditLogs } from '@/lib/actions/audit';
import { Skeleton } from '@/components/ui/skeleton';
import { DateTimeDisplay } from '@/components/business/DisplayFormatters';

const TABLES = ['', 'products', 'suppliers', 'purchase_orders', 'requisitions', 'invoices', 'user_roles', 'categories', 'areas'];
const ACTION_COLOR: Record<string, string> = { insert: 'bg-status-verde/10 text-status-verde', update: 'bg-status-azul/10 text-status-azul', soft_delete: 'bg-status-rojo/10 text-status-rojo' };

export default function AuditoriaPage() {
  const [tableName, setTableName] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['audit-logs', tableName],
    queryFn: () => listAuditLogs({ tableName: tableName || undefined }),
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-2xl font-semibold">Auditoría</h1>
        <p className="text-sm text-muted-foreground">Registro de creación, modificación y desactivación — solo lectura</p>
      </div>

      <select value={tableName} onChange={(e) => setTableName(e.target.value)} className="h-10 rounded-md border border-input bg-card px-3 text-sm">
        {TABLES.map((t) => <option key={t} value={t}>{t || 'Todas las tablas'}</option>)}
      </select>

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">Sin registros para este filtro.</p>
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          {data.map((log: any) => (
            <div key={log.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3 px-4 py-2.5 border-b border-border last:border-0 bg-card text-sm">
              <div className="flex items-center justify-between sm:contents">
                <span className="font-mono text-xs text-muted-foreground">{log.table_name}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ACTION_COLOR[log.action] ?? ''}`}>{log.action}</span>
              </div>
              <span className="text-muted-foreground sm:flex-1 sm:truncate">{log.user?.full_name ?? '—'}</span>
              <DateTimeDisplay value={log.performed_at} className="text-muted-foreground text-xs" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
