import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Megaphone, Pencil, Trash2 } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';
import { UPDATE_LIMITS, getUpdatePopup, publishUpdatePopup, retractUpdatePopup } from '@/services/admin';
import { EmptyState, LoadingState, SectionHeader, formatWhen } from './AdminShared';

function Preview({ title, content }: { title: string; content: string }) {
  return (
    <div className="bg-paper border border-line rounded-2xl p-5 shadow-lg">
      <div className="flex items-center gap-3 mb-4 text-sienna border-b border-line pb-3">
        <div className="p-2 bg-sienna/10 rounded-full"><Bell size={18} /></div>
        <h3 className="text-lg font-bold text-bone break-words">{title || 'Title'}</h3>
      </div>
      <div className="text-sm text-bone-dim whitespace-pre-wrap break-words max-h-64 overflow-y-auto">{content || 'Release notes…'}</div>
    </div>
  );
}

export function AdminAnnouncementsTab() {
  const { showToast, confirm } = useUIStore();
  const queryClient = useQueryClient();
  const [id, setId] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const current = useQuery({ queryKey: ['adminUpdatePopup'], queryFn: getUpdatePopup });

  const done = (msg: string) => {
    queryClient.invalidateQueries({ queryKey: ['adminUpdatePopup'] });
    queryClient.invalidateQueries({ queryKey: ['adminAudit'] });
    showToast(msg);
  };

  const publish = useMutation({
    mutationFn: () => publishUpdatePopup({ id, title, content }),
    onSuccess: () => { done('Update popup published'); setId(''); setTitle(''); setContent(''); },
    onError: (e: any) => showToast(e?.message || 'Could not publish', 'error'),
  });
  const retract = useMutation({
    mutationFn: () => retractUpdatePopup(current.data?.latestUpdateId),
    onSuccess: () => done('Popup retracted'),
    onError: (e: any) => showToast(e?.message || 'Could not retract', 'error'),
  });

  const sameId = !!current.data && id.trim() === current.data.latestUpdateId;

  const handlePublish = async () => {
    const message = sameId
      ? 'This ID matches the live popup, so users who already dismissed it will NOT see the new text. Use a new ID to show it again.'
      : 'Every user sees this popup once on their next app launch.';
    if (!await confirm({ title: 'Publish update popup?', message, confirmText: 'Publish', type: sameId ? 'warning' : 'primary', icon: sameId ? 'alert' : 'info' })) return;
    publish.mutate();
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <section className="card p-5">
        <SectionHeader icon={Megaphone} title="Publish update popup" description="Shown once per Update ID to every signed-in user." />
        <div className="space-y-4">
          <div>
            <label htmlFor="upd-id" className="label">Update ID</label>
            <input id="upd-id" value={id} maxLength={UPDATE_LIMITS.id} onChange={e => setId(e.target.value)} placeholder="v2.1.0" className="input-field font-mono" />
          </div>
          <div>
            <label htmlFor="upd-title" className="label">Title <span className="normal-case font-normal">({title.length}/{UPDATE_LIMITS.title})</span></label>
            <input id="upd-title" value={title} maxLength={UPDATE_LIMITS.title} onChange={e => setTitle(e.target.value)} placeholder="New update available!" className="input-field" />
          </div>
          <div>
            <label htmlFor="upd-content" className="label">Content <span className="normal-case font-normal">({content.length}/{UPDATE_LIMITS.content})</span></label>
            <textarea id="upd-content" value={content} maxLength={UPDATE_LIMITS.content} onChange={e => setContent(e.target.value)} rows={7} placeholder="We fixed bugs and improved performance…" className="input-field resize-y" />
          </div>
          <button onClick={handlePublish} disabled={publish.isPending || !id.trim() || !title.trim() || !content.trim()} className="btn-primary w-full">
            {publish.isPending ? 'Publishing…' : 'Publish popup'}
          </button>
          {(title || content) && <div><div className="label">Preview</div><Preview title={title} content={content} /></div>}
        </div>
      </section>

      <section className="card p-5">
        <SectionHeader title="Live popup" description="What users currently see on launch." />
        {current.isLoading ? <LoadingState /> : !current.data ? <EmptyState>No popup is live.</EmptyState> : (
          <div className="space-y-4">
            <div className="font-mono text-[11px] text-bone-dim">
              ID <span className="text-sienna">{current.data.latestUpdateId}</span> · published {formatWhen(current.data.timestamp)}
            </div>
            <Preview title={current.data.title} content={current.data.content} />
            <div className="flex gap-2">
              <button
                onClick={() => { setId(current.data!.latestUpdateId); setTitle(current.data!.title); setContent(current.data!.content); }}
                className="btn-secondary py-2 flex-1"
              >
                <Pencil size={13} /> Edit as new draft
              </button>
              <button
                disabled={retract.isPending}
                onClick={async () => { if (await confirm({ title: 'Retract popup?', message: 'Users who have not seen it yet will no longer get it.', confirmText: 'Retract' })) retract.mutate(); }}
                className="btn-danger py-2 gap-1.5"
              >
                <Trash2 size={13} /> Retract
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
