"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * My Room 全屏层的开关状态。
 *
 * 为什么上提到 Context：
 * 导航栏（SiteNav）长在 app/layout.tsx 里，而 My Room 覆盖层现在也挂在
 * layout 上 —— 两者不在同一层组件树里，用各自的 useState 无法互相控制。
 * 把 open 状态提到 Provider，导航栏的「My Room」按钮和覆盖层本身就能共享。
 */
type RoomContextValue = {
  open: boolean;
  openRoom: () => void;
  closeRoom: () => void;
};

const RoomContext = createContext<RoomContextValue | null>(null);

export function RoomProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const openRoom = useCallback(() => setOpen(true), []);
  const closeRoom = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ open, openRoom, closeRoom }),
    [open, openRoom, closeRoom],
  );

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom() {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error("useRoom must be used within RoomProvider");
  return ctx;
}
