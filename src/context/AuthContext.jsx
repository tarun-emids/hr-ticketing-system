import { createContext, useContext, useEffect, useState } from "react";
import * as api from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [users, setUsers] = useState([]);
  const [usersReady, setUsersReady] = useState(false);
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("hrdesk.user") ?? "null");
    } catch {
      return null;
    }
  });

  // Load the real user list once at startup (employees first, then agents).
  useEffect(() => {
    let alive = true;
    api
      .listUsers()
      .then((list) => {
        if (!alive) return;
        setUsers(list);
        setUsersReady(true);
        // Drop a stored session whose id no longer exists (e.g. old mock ids u1/h1)
        setUser((cur) => (cur && list.some((u) => u.id === cur.id) ? cur : null));
      })
      .catch(() => {
        // Backend unreachable — keep any stored session so the UI stays usable
        if (alive) setUsersReady(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (user) localStorage.setItem("hrdesk.user", JSON.stringify(user));
    else localStorage.removeItem("hrdesk.user");
  }, [user]);

  const value = {
    user,
    users,
    usersReady,
    isAgent: user?.role === "agent",
    login: setUser,
    logout: () => setUser(null),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
