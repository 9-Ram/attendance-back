import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  user: "postgres",
  host: "localhost",
  database: "Student_name_check1",
  password: "Ram12345678",
  port: 5432,
});

export default pool;
