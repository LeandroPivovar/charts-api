import { Knex } from "knex";
import dotenv from 'dotenv';
dotenv.config();

const config: Knex.Config = {
    client: "pg",
    connection: {
        host: process.env.DATABASE_HOST,
        port: process.env.DATABASE_PORT,
        user: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        database: process.env.DATABASE_NAME
    },
    migrations: {
        directory: "./migrations",
    },
};

export default config;