import { ChevronRight, Home } from "lucide-react";

interface Segment {
  name: string;
  path: string;
}

interface BreadcrumbProps {
  segments: Segment[];
  onNavigate: (path: string) => void;
}

export default function Breadcrumb({ segments, onNavigate }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 mb-4 flex-wrap">
      <button
        onClick={() => onNavigate("")}
        className="flex items-center gap-1 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
      >
        <Home size={14} />
        <span>Home</span>
      </button>

      {segments.map((seg, i) => (
        <span key={seg.path} className="flex items-center gap-1">
          <ChevronRight size={14} />
          {i === segments.length - 1 ? (
            <span className="text-gray-900 dark:text-gray-100 font-medium">
              {seg.name}
            </span>
          ) : (
            <button
              onClick={() => onNavigate(seg.path)}
              className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              {seg.name}
            </button>
          )}
        </span>
      ))}
    </nav>
  );
}
