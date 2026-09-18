import { Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import { RequireAccount } from "./components/RequireAccount";
import Admin from "./pages/Admin";
import Community from "./pages/Community";
import Dashboard from "./pages/Dashboard";
import DeckDetail from "./pages/DeckDetail";
import Decks from "./pages/Decks";
import Editais from "./pages/Editais";
import ExamDetail from "./pages/ExamDetail";
import Login from "./pages/Login";
import Organize from "./pages/Organize";
import Register from "./pages/Register";
import Stats from "./pages/Stats";
import Study from "./pages/Study";
import TitleBar from "./components/TitleBar";
import Account from "./pages/Account";
import ErrorNotebook from "./pages/ErrorNotebook";
import Notes from "./pages/Notes";

export default function App() {
  return (
    <>
      <TitleBar />
      <div className="h-[calc(100vh-36px)]">
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          <Route element={<Layout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/decks" element={<Decks />} />
            <Route path="/decks/:id" element={<DeckDetail />} />
            <Route path="/organizar" element={<Organize />} />
            <Route path="/study" element={<Study />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/conta" element={<Account />} />
            <Route path="/editais" element={<Editais />} />
            <Route path="/erro" element={<ErrorNotebook />} />
            <Route path="/notes" element={<Notes />} />
            <Route path="/editais/:id" element={<ExamDetail />} />

            {/* Só estas duas dependem do servidor + de uma conta. */}
            <Route element={<RequireAccount />}>
              <Route path="/community" element={<Community />} />
              <Route path="/admin" element={<Admin />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </>
  );
}
