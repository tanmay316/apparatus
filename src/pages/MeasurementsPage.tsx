import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Calendar, Trash2, LineChart, Scale, Compass, Activity, Check } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { addMeasurement, getMeasurements, deleteMeasurement } from '@/services/measurements';
import type { Measurement } from '@/types';

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } }
};

const item = {
  hidden: { opacity: 0, y: 15 },
  show: { opacity: 1, y: 0 }
};

// ─── Trend Chart (Canvas-based) ──────────────────────────
function MeasurementChart({ data, metric }: { data: Measurement[]; metric: 'weight' | 'bodyfat' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Filter valid data points & reverse to chronological order
    const points = data
      .filter((m) => m[metric] !== undefined && m[metric] !== null && m[metric]! > 0)
      .slice(0, 15) // last 15 entries
      .reverse();

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, w, h);

    if (points.length < 2) {
      ctx.fillStyle = '#6E6D6B';
      ctx.font = 'mono 12px "JetBrains Mono"';
      ctx.textAlign = 'center';
      ctx.fillText('Log at least 2 entries to display trend chart.', w / 2, h / 2);
      return;
    }

    const padding = { left: 40, right: 20, top: 20, bottom: 35 };
    const chartW = w - padding.left - padding.right;
    const chartH = h - padding.top - padding.bottom;

    const values = points.map((p) => p[metric] as number);
    const minVal = Math.min(...values) * 0.98;
    const maxVal = Math.max(...values) * 1.02;
    const valRange = maxVal - minVal;

    // Drawing Grid Lines (horizontal)
    ctx.strokeStyle = 'rgba(217, 214, 206, 0.05)';
    ctx.lineWidth = 1;
    ctx.font = '9px "JetBrains Mono"';
    ctx.fillStyle = '#6E6D6B';
    ctx.textAlign = 'right';

    const gridLines = 4;
    for (let i = 0; i <= gridLines; i++) {
      const val = minVal + (valRange * i) / gridLines;
      const y = padding.top + chartH - (chartH * i) / gridLines;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(w - padding.right, y);
      ctx.stroke();
      ctx.fillText(val.toFixed(1), padding.left - 8, y + 3);
    }

    // Map data to canvas coordinates
    const getX = (idx: number) => padding.left + (chartW * idx) / (points.length - 1);
    const getY = (val: number) => padding.top + chartH - ((val - minVal) / valRange) * chartH;

    // Draw area path (gradient fill under line)
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(points[0][metric] as number));
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(getX(i), getY(points[i][metric] as number));
    }
    ctx.lineTo(getX(points.length - 1), padding.top + chartH);
    ctx.lineTo(getX(0), padding.top + chartH);
    ctx.closePath();

    const areaGrad = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
    areaGrad.addColorStop(0, metric === 'weight' ? 'rgba(93, 42, 26, 0.15)' : 'rgba(242, 191, 73, 0.15)');
    areaGrad.addColorStop(1, 'rgba(93, 42, 26, 0.0)');
    ctx.fillStyle = areaGrad;
    ctx.fill();

    // Draw line
    ctx.beginPath();
    ctx.moveTo(getX(0), getY(points[0][metric] as number));
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(getX(i), getY(points[i][metric] as number));
    }
    ctx.strokeStyle = metric === 'weight' ? '#5d2a1a' : '#F2BF49';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw dots
    for (let i = 0; i < points.length; i++) {
      const cx = getX(i);
      const cy = getY(points[i][metric] as number);

      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#14151A';
      ctx.fill();
      ctx.strokeStyle = metric === 'weight' ? '#5d2a1a' : '#F2BF49';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Draw dates on X-axis (last & first)
    ctx.fillStyle = '#8C8984';
    ctx.textAlign = 'center';
    
    // Show dates for points
    const step = Math.max(1, Math.floor(points.length / 3));
    for (let i = 0; i < points.length; i += step) {
      const dateParts = points[i].date.split('-');
      const label = `${dateParts[1]}/${dateParts[2]}`; // MM/DD
      ctx.fillText(label, getX(i), padding.top + chartH + 16);
    }
    
    // If last point skipped due to step
    if ((points.length - 1) % step !== 0) {
      const dateParts = points[points.length - 1].date.split('-');
      ctx.fillText(`${dateParts[1]}/${dateParts[2]}`, getX(points.length - 1), padding.top + chartH + 16);
    }
  }, [data, metric]);

  return <canvas ref={canvasRef} className="w-full h-48 block" />;
}

export function MeasurementsPage() {
  const { profile } = useAuthStore();
  const queryClient = useQueryClient();

  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [weight, setWeight] = useState('');
  const [bodyfat, setBodyfat] = useState('');
  const [chest, setChest] = useState('');
  const [waist, setWaist] = useState('');
  const [arms, setArms] = useState('');
  const [shoulders, setShoulders] = useState('');
  const [thighs, setThighs] = useState('');

  const [errorMsg, setErrorMsg] = useState('');
  const [success, setSuccess] = useState(false);

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ['measurements', profile?.uid],
    queryFn: () => getMeasurements(profile!.uid),
    enabled: !!profile?.uid,
  });

  const addMutation = useMutation({
    mutationFn: (data: Omit<Measurement, 'id'>) => addMeasurement(profile!.uid, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['measurements', profile?.uid] });
      queryClient.invalidateQueries({ queryKey: ['stats', profile?.uid] });
      // Reset form
      setWeight('');
      setBodyfat('');
      setChest('');
      setWaist('');
      setArms('');
      setShoulders('');
      setThighs('');
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Failed to save measurement log.');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMeasurement(profile!.uid, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['measurements', profile?.uid] });
    }
  });

  if (isLoading || !profile) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-sienna border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    
    const parsedWeight = parseFloat(weight);
    if (!parsedWeight || parsedWeight <= 0) {
      setErrorMsg('Weight is required and must be greater than 0.');
      return;
    }

    addMutation.mutate({
      date,
      weight: parsedWeight,
      bodyfat: parseFloat(bodyfat) || undefined,
      chest: parseFloat(chest) || undefined,
      waist: parseFloat(waist) || undefined,
      arms: parseFloat(arms) || undefined,
      shoulders: parseFloat(shoulders) || undefined,
      thighs: parseFloat(thighs) || undefined,
    });
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this log entry?')) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="space-y-6">
      {/* Header */}
      <motion.div variants={item} className="pb-5 border-b border-line mb-6">
        <div className="font-mono text-amber text-xs tracking-widest mb-1">METRIC TRACKER</div>
        <h1 className="font-display text-3xl mb-1">Body Log</h1>
        <p className="text-bone-dim text-sm max-w-xl">Log and analyze your weight, body fat %, and muscle dimensions to monitor physical evolution.</p>
      </motion.div>

      {/* Analytics row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div variants={item} className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Scale size={18} className="text-sienna" />
            <h3 className="font-display text-base">Weight Progress (kg)</h3>
          </div>
          <MeasurementChart data={logs} metric="weight" />
        </motion.div>

        <motion.div variants={item} className="card p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity size={18} className="text-amber" />
            <h3 className="font-display text-base">Body Fat Trend (%)</h3>
          </div>
          <MeasurementChart data={logs} metric="bodyfat" />
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form */}
        <motion.div variants={item} className="card p-5 lg:col-span-1">
          <h3 className="font-display text-base mb-4">LOG NEW METRICS</h3>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label">Date</label>
              <input
                type="date"
                required
                className="input-field font-mono"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Weight (kg) *</label>
                <input
                  type="number"
                  step="0.1"
                  required
                  placeholder="e.g. 72.5"
                  className="input-field font-mono bg-ink-2"
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Body Fat (%)</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="e.g. 12.4"
                  className="input-field font-mono bg-ink-2"
                  value={bodyfat}
                  onChange={(e) => setBodyfat(e.target.value)}
                />
              </div>
            </div>

            <div className="text-xs font-mono text-bone-dim tracking-wider uppercase pt-2 border-t border-line/30">
              Tape Measurements (Optional)
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Chest (cm)</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="Chest"
                  className="input-field font-mono bg-ink-2"
                  value={chest}
                  onChange={(e) => setChest(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Waist (cm)</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="Waist"
                  className="input-field font-mono bg-ink-2"
                  value={waist}
                  onChange={(e) => setWaist(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="label">Arms</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="cm"
                  className="input-field font-mono bg-ink-2 text-sm"
                  value={arms}
                  onChange={(e) => setArms(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Shoulders</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="cm"
                  className="input-field font-mono bg-ink-2 text-sm"
                  value={shoulders}
                  onChange={(e) => setShoulders(e.target.value)}
                />
              </div>
              <div>
                <label className="label">Thighs</label>
                <input
                  type="number"
                  step="0.1"
                  placeholder="cm"
                  className="input-field font-mono bg-ink-2 text-sm"
                  value={thighs}
                  onChange={(e) => setThighs(e.target.value)}
                />
              </div>
            </div>

            {errorMsg && <div className="text-xs text-danger font-mono bg-danger/10 p-2.5 rounded border border-danger/20">{errorMsg}</div>}
            
            {success && (
              <div className="text-xs text-sienna font-mono bg-sienna/10 p-2.5 rounded border border-sienna/20 flex items-center gap-1.5">
                <Check size={14} /> Entry logged successfully!
              </div>
            )}

            <button
              type="submit"
              disabled={addMutation.isPending}
              className="btn-primary w-full py-2.5"
            >
              {addMutation.isPending ? 'Saving...' : 'Log Entry'}
            </button>
          </form>
        </motion.div>

        {/* History Table */}
        <motion.div variants={item} className="card p-5 lg:col-span-2 flex flex-col h-[520px]">
          <h3 className="font-display text-base mb-4">LOG HISTORY</h3>
          
          <div className="flex-1 overflow-auto pr-1 custom-scrollbar">
            {logs.length === 0 ? (
              <div className="text-center py-20 text-bone-dim text-sm border border-dashed border-line rounded-lg">
                No metric records yet. Make your first entry on the left!
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-line text-xs font-mono text-bone-dim uppercase">
                    <th className="py-2.5">Date</th>
                    <th className="py-2.5 text-right">Weight</th>
                    <th className="py-2.5 text-right">Fat %</th>
                    <th className="py-2.5 text-right hidden sm:table-cell">Waist</th>
                    <th className="py-2.5 text-right hidden sm:table-cell">Chest</th>
                    <th className="py-2.5 text-right hidden md:table-cell">Arms</th>
                    <th className="py-2.5 text-right hidden md:table-cell">Shoulders</th>
                    <th className="py-2.5 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/30 font-mono">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-line/10 transition-colors">
                      <td className="py-3 flex items-center gap-1.5 text-bone">
                        <Calendar size={13} className="text-sienna" />
                        {log.date}
                      </td>
                      <td className="py-3 text-right font-bold text-sienna">{log.weight} kg</td>
                      <td className="py-3 text-right text-amber">{log.bodyfat ? `${log.bodyfat}%` : '—'}</td>
                      <td className="py-3 text-right text-bone-dim hidden sm:table-cell">{log.waist ? `${log.waist}cm` : '—'}</td>
                      <td className="py-3 text-right text-bone-dim hidden sm:table-cell">{log.chest ? `${log.chest}cm` : '—'}</td>
                      <td className="py-3 text-right text-bone-dim hidden md:table-cell">{log.arms ? `${log.arms}cm` : '—'}</td>
                      <td className="py-3 text-right text-bone-dim hidden md:table-cell">{log.shoulders ? `${log.shoulders}cm` : '—'}</td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => log.id && handleDelete(log.id)}
                          className="p-1 hover:bg-line rounded text-bone-dim hover:text-danger transition-all"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}
