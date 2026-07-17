/**
 * UserMenu — 简化的用户菜单（无需登录）
 */
import { User } from "lucide-react";

interface UserMenuProps {
  collapsed?: boolean;
}

export function UserMenu({ collapsed = false }: UserMenuProps) {
  if (collapsed) {
    return (
      <div className="rounded-md p-2 text-muted-foreground">
        <User size={18} />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md px-3 py-2 text-muted-foreground">
      <User size={16} />
      <span className="text-sm">访客模式</span>
    </div>
  );
}
