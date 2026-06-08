import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(e) { return { error: e }; }
  componentDidCatch(e) { console.error("Fonkiart error:", e); }
  render() {
    if (this.state.error) return (
      <div style={{ padding:"52px 48px", fontFamily:"'DM Sans',sans-serif" }}>
        <div style={{ fontFamily:"'Cormorant Garamond',serif", fontSize:28, fontWeight:300, marginBottom:12, color:"#1c1a18" }}>Something went wrong</div>
        <p style={{ fontSize:13, color:"#8a8078", marginBottom:24, lineHeight:1.7 }}>{this.state.error?.message || "An unexpected error occurred."}</p>
        <button onClick={() => this.setState({ error:null })} style={{ background:"var(--sidebar-bg)", color:"#fff", border:"none", padding:"11px 28px", cursor:"pointer", fontFamily:"'DM Sans',sans-serif", fontSize:12, letterSpacing:".1em", textTransform:"uppercase" }}>Try Again</button>
      </div>
    );
    return this.props.children;
  }
}
