import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Plus, Compass, Calendar, TrendingUp, Target } from 'lucide-react';

const actions = [
  { label: 'Create Plan', icon: Plus, path: '/plans', color: 'text-teal', bg: 'bg-teal/10', border: 'border-teal/15' },
  { label: 'Explore', icon: Compass, path: '/explore', color: 'text-amber', bg: 'bg-amber/10', border: 'border-amber/15' },
  { label: 'Calendar', icon: Calendar, path: '/calendar', color: 'text-teal', bg: 'bg-teal/10', border: 'border-teal/15' },
  { label: 'Progress', icon: TrendingUp, path: '/progress', color: 'text-amber', bg: 'bg-amber/10', border: 'border-amber/15' },
  { label: 'Skills', icon: Target, path: '/skills', color: 'text-teal', bg: 'bg-teal/10', border: 'border-teal/15' },
];

export function QuickActions() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="mb-6"
    >
      <h3 className="font-mono text-[11px] text-bone-dim tracking-[0.15em] uppercase mb-3">Quick Actions</h3>
      <div className="grid grid-cols-5 gap-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.label}
              to={action.path}
              className="flex flex-col items-center gap-2.5 py-4 rounded-2xl border border-white/[0.06] bg-ink-2/40 hover:bg-white/[0.03] hover:border-white/10 transition-all duration-200 group"
            >
              <div className={`w-12 h-12 rounded-2xl ${action.bg} border ${action.border} flex items-center justify-center ${action.color} group-hover:scale-110 transition-transform duration-200`}>
                <Icon size={22} />
              </div>
              <span className="font-mono text-[10px] text-bone-dim tracking-wider group-hover:text-bone transition-colors">
                {action.label.toUpperCase()}
              </span>
            </Link>
          );
        })}
      </div>
    </motion.div>
  );
}
