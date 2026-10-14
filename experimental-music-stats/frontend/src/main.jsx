import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="fatal-screen">
          <h1>Music Stats</h1>
          <p>No se pudo cargar la interfaz.</p>
          <pre>{this.state.error.message}</pre>
        </main>
      );
    }
    return this.props.children;
  }
}

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  );
} else {
  document.body.innerHTML = "<main class=\"fatal-screen\"><h1>Music Stats</h1><p>No existe el contenedor root.</p></main>";
}
