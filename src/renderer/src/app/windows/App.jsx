import { MainWindow } from "./MainWindow.jsx";
import { ChatWindow } from "./ChatWindow.jsx";
import { CharacterEditorWindow } from "./CharacterEditorWindow.jsx";

export default function App() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("view") === "chat") {
    return <ChatWindow />;
  }
  if (params.get("view") === "character-editor") {
    return <CharacterEditorWindow />;
  }

  return <MainWindow />;
}
