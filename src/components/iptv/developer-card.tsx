/* eslint-disable @next/next/no-img-element */
"use client";

/**
 * Developer credit — Ayman Chowdhury.
 *  - <DeveloperBadge />  compact pill for the footer (photo + name + link)
 *  - <DeveloperCard />   full card for the Settings "About" section
 * Photo is served from Cloudinary with permissive CORS + long cache.
 */

export const DEVELOPER = {
  name: "Ayman Chowdhury",
  url: "https://aymann.is-a.dev",
  photo:
    "https://res.cloudinary.com/ne2uunmx/image/upload/v1791478541/portfolio/whtrhrg0fdrd8qedfgso.jpg",
};

/** Compact pill — footer credit */
export function DeveloperBadge() {
  return (
    <a
      href={DEVELOPER.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Developed by ${DEVELOPER.name} — ${DEVELOPER.url}`}
      className="group/dev flex items-center gap-2.5 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 pl-1.5 pr-4 py-1.5 hover:border-emerald-500/50 hover:shadow-md hover:shadow-emerald-600/10 transition-all"
    >
      <img
        src={DEVELOPER.photo}
        alt=""
        width={32}
        height={32}
        loading="lazy"
        decoding="async"
        className="w-8 h-8 rounded-full object-cover object-top ring-1 ring-zinc-200 dark:ring-zinc-700"
      />
      <span className="flex flex-col leading-tight text-left">
        <span className="text-[9px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Developed by
        </span>
        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200 group-hover/dev:text-emerald-600 dark:group-hover/dev:text-emerald-400 transition-colors">
          {DEVELOPER.name}
        </span>
      </span>
    </a>
  );
}

/** Full card — Settings → About */
export function DeveloperCard() {
  return (
    <a
      href={DEVELOPER.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group/dev flex items-center gap-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-gradient-to-r from-emerald-500/[0.07] to-teal-500/[0.05] p-3.5 hover:border-emerald-500/40 transition-colors"
    >
      <img
        src={DEVELOPER.photo}
        alt={DEVELOPER.name}
        width={56}
        height={56}
        loading="lazy"
        decoding="async"
        className="w-14 h-14 rounded-full object-cover object-top ring-2 ring-emerald-500/25 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Developed by
        </p>
        <p className="text-sm font-bold text-zinc-900 dark:text-white truncate">
          {DEVELOPER.name}
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 truncate">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-3 h-3 shrink-0"
            aria-hidden
          >
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          <span className="truncate group-hover/dev:underline">
            {DEVELOPER.url.replace(/^https?:\/\//, "")}
          </span>
        </p>
      </div>
      <span
        aria-hidden
        className="shrink-0 text-zinc-300 dark:text-zinc-600 group-hover/dev:text-emerald-500 group-hover/dev:translate-x-0.5 group-hover/dev:-translate-y-0.5 transition-all"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
          <path d="M7 17 17 7" />
          <path d="M7 7h10v10" />
        </svg>
      </span>
    </a>
  );
}
