import mongoose from "mongoose";

export async function connectDatabase() {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
        throw new Error("Falta configurar MONGODB_URI en backend/.env.");
    }

    const connection = await mongoose.connect(uri, {
        dbName: process.env.MONGODB_DATABASE || "GymWeb"
    });
    console.log(`MongoDB conectado: ${connection.connection.name}`);
}
