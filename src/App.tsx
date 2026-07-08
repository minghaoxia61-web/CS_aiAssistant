import { lazy, Suspense } from "react";
import { HashRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Layout from "@/components/Layout";
import Dialog from "@/components/Dialog";

// 路由级懒加载：每个页面拆为独立 chunk，首屏只加载当前路由
const Knowledge = lazy(() => import("@/pages/Knowledge"));
const Setup = lazy(() => import("@/pages/Setup"));
const Library = lazy(() => import("@/pages/Library"));
const Chat = lazy(() => import("@/pages/Chat"));
const Review = lazy(() => import("@/pages/Review"));
const Quiz = lazy(() => import("@/pages/Quiz"));
const WrongBook = lazy(() => import("@/pages/WrongBook"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const Profile = lazy(() => import("@/pages/Profile"));

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-6 h-6 border-2 border-amber/30 border-t-amber rounded-full animate-spin" />
    </div>
  );
}

function withSuspense(Comp: React.ComponentType) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Comp />
    </Suspense>
  );
}

export default function App() {
  return (
    <Router>
      <Dialog />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/knowledge" replace />} />
          <Route path="/knowledge" element={withSuspense(Knowledge)} />
          <Route path="/setup" element={withSuspense(Setup)} />
          <Route path="/library" element={withSuspense(Library)} />
          <Route path="/chat" element={withSuspense(Chat)} />
          <Route path="/review" element={withSuspense(Review)} />
          <Route path="/quiz" element={withSuspense(Quiz)} />
          <Route path="/wrong-book" element={withSuspense(WrongBook)} />
          <Route path="/analytics" element={withSuspense(Analytics)} />
          <Route path="/profile" element={withSuspense(Profile)} />
        </Route>
      </Routes>
    </Router>
  );
}
