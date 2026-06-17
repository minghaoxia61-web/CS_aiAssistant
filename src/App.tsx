import { HashRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import Layout from "@/components/Layout";
import Dialog from "@/components/Dialog";
import Setup from "@/pages/Setup";
import Library from "@/pages/Library";
import Chat from "@/pages/Chat";
import Review from "@/pages/Review";
import Quiz from "@/pages/Quiz";

export default function App() {
  return (
    <Router>
      <Dialog />
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Navigate to="/chat" replace />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/library" element={<Library />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/review" element={<Review />} />
          <Route path="/quiz" element={<Quiz />} />
        </Route>
      </Routes>
    </Router>
  );
}
