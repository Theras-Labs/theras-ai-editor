import type { PropsWithChildren } from "react";

type SidebarPanelProps = PropsWithChildren<{
  title: string;
  badge: string;
}>;

export function SidebarPanel({ badge, children, title }: SidebarPanelProps) {
  return (
    <aside className="sidebar-panel">
      <div className="sidebar-header">
        <h2>{title}</h2>
        <span>{badge}</span>
      </div>

      <div className="sidebar-body">{children}</div>
    </aside>
  );
}
