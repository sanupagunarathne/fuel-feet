import { useQuery } from '@tanstack/react-query';
import { healthResponseSchema } from '@fuel-feet/shared';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

async function getHealth(signal: AbortSignal) {
  const response = await fetch(`${apiBaseUrl}/health`, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('API health check failed');
  return healthResponseSchema.parse(await response.json());
}

export function ConnectionStatus() {
  const health = useQuery({
    queryKey: ['api-health'],
    queryFn: ({ signal }) => getHealth(signal),
    retry: false,
  });
  const pending = health.isFetching || health.isPending;
  const unavailable = health.isError && !pending;

  return (
    <div className="connection">
      <span role="status" aria-label="API connection" className={`connection-status ${unavailable ? 'text-danger' : ''}`}>
        <span className={`connection-dot ${pending ? '' : unavailable ? 'connection-dot--error' : 'connection-dot--ok'}`} />
        <span>{pending ? 'Checking connection…' : unavailable ? 'Connection unavailable' : 'Connected'}</span>
      </span>
      {health.isError && (
        <button className="text-link min-h-11 px-2" disabled={pending} onClick={() => void health.refetch()} type="button">
          Retry
        </button>
      )}
    </div>
  );
}
