import React from 'react';

export default function EmptyState({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111625] p-10 text-center">
      {Icon && (
        <div className="w-11 h-11 mx-auto rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 flex items-center justify-center mb-3.5">
          <Icon className="w-5 h-5" aria-hidden="true" />
        </div>
      )}
      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1.5 leading-relaxed">
        {description}
      </p>

      {(primaryAction || secondaryAction) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
          {primaryAction && (
            <button
              type="button"
              onClick={primaryAction.onClick}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#4F46E5] hover:bg-[#4338CA] text-white text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-[#111625] cursor-pointer"
            >
              {primaryAction.icon && <primaryAction.icon className="w-3.5 h-3.5" />}
              <span>{primaryAction.label}</span>
            </button>
          )}
          {secondaryAction && (
            <button
              type="button"
              onClick={secondaryAction.onClick}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white dark:bg-[#161C2E] hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-[#111625] cursor-pointer"
            >
              {secondaryAction.icon && <secondaryAction.icon className="w-3.5 h-3.5" />}
              <span>{secondaryAction.label}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
