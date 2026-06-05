import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;
  const DATA_FILE = path.join(process.cwd(), "db.json");

  // Initial Data Setup
  if (!fs.existsSync(DATA_FILE)) {
    const initialData = {
      employees: [
        { id: "e1", name: "John Doe", role: "EMPLOYEE", department: "Engineering", email: "john@example.com", credits: 850, compliance: 95 },
        { id: "e2", name: "Jane Smith", role: "MANAGER", department: "Engineering", email: "jane@example.com", credits: 920, compliance: 98 },
        { id: "e3", name: "Admin User", role: "HR", department: "HR", email: "admin@example.com", credits: 0, compliance: 100 }
      ],
      goals: [],
      submissions: [],
      achievements: [],
      complianceLogs: [],
      appraisals: []
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initialData, null, 2));
  }

  app.use(express.json());

  // API Routes
  app.get("/api/db", (req, res) => {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, "utf-8"));
    res.json(data);
  });

  app.post("/api/db", (req, res) => {
    fs.writeFileSync(DATA_FILE, JSON.stringify(req.body, null, 2));
    res.json({ success: true });
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
