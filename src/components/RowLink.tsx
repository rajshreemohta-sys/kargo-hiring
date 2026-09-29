"use client";
import { useRouter } from "next/navigation";

/**
 * A table row that opens `href` when clicked anywhere. Buttons and links inside keep their own
 * behaviour, and selecting text doesn't navigate. The name cell stays a real link for keyboard
 * users and Cmd/Ctrl-click.
 */
export function RowLink({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <tr
      className="cursor-pointer border-b border-line last:border-0 hover:bg-soft"
      onMouseEnter={() => router.prefetch(href)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("a, button, input, textarea, select, label")) return;
        if (window.getSelection()?.toString()) return;
        if (e.metaKey || e.ctrlKey) window.open(href, "_blank");
        else router.push(href);
      }}
    >
      {children}
    </tr>
  );
}
