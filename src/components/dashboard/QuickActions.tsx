import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Plus, Compass, Calendar, TrendingUp, Target } from 'lucide-react';

const actions = [
  { label: 'Create Plan', icon: Plus, path: '/plans' },
  { label: 'Explore', icon: Compass, path: '/explore' },
  { label: 'Calendar', icon: Calendar, path: '/calendar' },
  { label: 'Progress', icon: TrendingUp, path: '/progress' },
  { label: 'Skills', icon: Target, path: '/skills' },
];

export function QuickActions() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25 }}
      className="mb-6"
    >
      <h3 className="font-sans text-xs font-medium text-[#777b86] tracking-wider uppercase mb-3">Quick Actions</h3>
      <div className="grid grid-cols-5 gap-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.label}
              to={action.path}
              className="flex flex-col items-center gap-2.5 py-4 rounded-[24px] bg-[#f2f2f3] hover:bg-white hover:shadow-[0_0_0_1px_rgba(4,23,43,0.05),0_4px_12px_rgba(0,0,0,0.06)] transition-all duration-200 group"
            >
              <div className="w-12 h-12 rounded-full bg-white flex items-center justify-center text-[#17191c] group-hover:scale-110 transition-transform duration-200">
                <Icon size={22} />
              </div>
              <span className="font-sans text-[10px] text-[#979799] tracking-wider group-hover:text-[#17191c] transition-colors">
                {action.label.toUpperCase()}
              </span>
            </Link>
          );
        })}
      </div>
    </motion.div>
  );
}
