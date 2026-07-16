/**
 * UserMenu — 用户登录/注册菜单
 */
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { LogIn, LogOut, User, UserPlus } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

interface UserInfo {
  id: string;
  username: string;
  createdAt: number;
}

export function UserMenu() {
  const { t } = useTranslation();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = useCallback(async () => {
    if (!username.trim() || !password.trim()) {
      toast.error("请输入用户名和密码");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        setUser(data.user);
        setShowLogin(false);
        setUsername("");
        setPassword("");
        toast.success("登录成功");
      }
    } catch {
      toast.error("登录失败");
    } finally {
      setLoading(false);
    }
  }, [username, password]);

  const handleRegister = useCallback(async () => {
    if (!username.trim() || !password.trim()) {
      toast.error("请输入用户名和密码");
      return;
    }
    if (username.trim().length < 3) {
      toast.error("用户名至少3个字符");
      return;
    }
    if (password.length < 6) {
      toast.error("密码至少6个字符");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        setUser(data.user);
        setShowRegister(false);
        setUsername("");
        setPassword("");
        toast.success("注册成功");
      }
    } catch {
      toast.error("注册失败");
    } finally {
      setLoading(false);
    }
  }, [username, password]);

  const handleLogout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      setUser(null);
      toast.success("已退出登录");
    } catch {
      toast.error("退出失败");
    }
  }, []);

  // Check login status on mount
  useState(() => {
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user) setUser(data.user);
      })
      .catch(() => {});
  });

  if (showLogin || showRegister) {
    return (
      <div className="space-y-2 p-2">
        <div className="text-sm font-medium">
          {showLogin ? "登录" : "注册"}
        </div>
        <Input
          placeholder="用户名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              showLogin ? handleLogin() : handleRegister();
            }
          }}
        />
        <Input
          type="password"
          placeholder="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              showLogin ? handleLogin() : handleRegister();
            }
          }}
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1"
            onClick={showLogin ? handleLogin() : handleRegister()}
            disabled={loading}
          >
            {loading ? "处理中..." : showLogin ? "登录" : "注册"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setShowLogin(false);
              setShowRegister(false);
              setUsername("");
              setPassword("");
            }}
          >
            取消
          </Button>
        </div>
        <div className="text-center text-xs text-muted-foreground">
          {showLogin ? (
            <button
              type="button"
              className="hover:underline"
              onClick={() => {
                setShowLogin(false);
                setShowRegister(true);
              }}
            >
              没有账号？去注册
            </button>
          ) : (
            <button
              type="button"
              className="hover:underline"
              onClick={() => {
                setShowRegister(false);
                setShowLogin(true);
              }}
            >
              已有账号？去登录
            </button>
          )}
        </div>
      </div>
    );
  }

  if (user) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-muted"
          >
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10">
              <User size={14} className="text-primary" />
            </div>
            <span className="flex-1 truncate">{user.username}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem disabled>
            <User size={14} className="mr-2" />
            {user.username}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout}>
            <LogOut size={14} className="mr-2" />
            退出登录
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <div className="space-y-1 px-2">
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-md p-1.5 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={() => setShowLogin(true)}
      >
        <LogIn size={14} />
        <span>登录</span>
      </button>
      <button
        type="button"
        className="flex w-full items-center gap-2 rounded-md p-1.5 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
        onClick={() => setShowRegister(true)}
      >
        <UserPlus size={14} />
        <span>注册</span>
      </button>
    </div>
  );
}
