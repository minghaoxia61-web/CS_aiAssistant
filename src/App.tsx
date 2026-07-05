import { HashRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Layout from "@/components/Layout";
import Dialog from "@/components/Dialog";
import Setup from "@/pages/Setup";
import Library from "@/pages/Library";
import Chat from "@/pages/Chat";
import Review from "@/pages/Review";
import Quiz from "@/pages/Quiz";
import WrongBook from "@/pages/WrongBook";
import Analytics from "@/pages/Analytics";
import Profile from "@/pages/Profile";
import Knowledge from "@/pages/Knowledge";

export default function App() {
  return (
    <Router>
      <Dialog />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/knowledge" replace />} />
          <Route path="/knowledge" element={<Knowledge />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/library" element={<Library />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/review" element={<Review />} />
          <Route path="/quiz" element={<Quiz />} />
          <Route path="/wrong-book" element={<WrongBook />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
      </Routes>
    </Router>
  );
}
