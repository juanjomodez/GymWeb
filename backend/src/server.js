import "dotenv/config";
import cors from "cors";
import express from "express";
import mongoose from "mongoose";
import { connectDatabase } from "./config/database.js";

const app = express();
const port = process.env.PORT || 3000;

app.use(cors({ origin: process.env.FRONTEND_URL || "http://127.0.0.1:5500" }));
app.use(express.json());

app.get("/health", (request, response) => {
    const isDatabaseConnected = mongoose.connection.readyState === 1;

    response.status(isDatabaseConnected ? 200 : 503).json({
        status: isDatabaseConnected ? "ok" : "error",
        database: isDatabaseConnected ? mongoose.connection.name : "disconnected"
    });
});

app.use((error, request, response, next) => {
    console.error(error);
    response.status(500).json({ message: "Ocurrió un error en el servidor." });
});

async function startServer() {
    try {
        await connectDatabase();
        app.listen(port, () => {
            console.log(`API de GymFlow disponible en http://localhost:${port}`);
        });
    } catch (error) {
        console.error("No se pudo iniciar la API o conectar MongoDB:", error.message);
        process.exitCode = 1;
    }
}

startServer();
