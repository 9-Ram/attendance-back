import { Router } from "express";
import pool from "../config/pg.js";
import upload from "../middleware/upload.js";
import fs from "fs";
import path from "path";

const stdRoute = Router();

// stdRoute.post("/create-std", async (req, res) => {
//   try {
//     const { fullName, studentId, username, password } = req.body;
//     if (!fullName || !studentId || !username || !password)
//       return res.status(400);

//     const isStdExit = `select * from students where std_class_id = $1`;
//     const findStdIdEsit = await pool.query(isStdExit, [studentId]);
//     if (findStdIdEsit.rows.length > 0) {
//       return res.json({
//         err: "มีข้อมูลรหัสนักศึกษานี้อยู่แล้ว ไม่สามารถลงทะเบียนได้",
//       });
//     }

//     const where = `select * from users where username = $1`;
//     const fintExitStd = await pool.query(where, [username]);
//     if (fintExitStd.rows.length > 0)
//       return res.json({
//         err: "มีข้อมูล username นี้อยู่แล้ว ไม่สามารถลงทะเบียนได้",
//       });

//     const internToUser = `INSERT INTO users (username,password,role_id) 
//                    VALUES ($1, $2, $3) RETURNING *`;
//     const query = `INSERT INTO students (fullname,std_class_id,username,password,major) 
//                    VALUES ($1, $2, $3, $4, $5) RETURNING *`;

//     const insertUser = await pool.query(internToUser, [username, password, 1]);
//     const result = await pool.query(query, [
//       fullName,
//       studentId,
//       username,
//       password,
//       "IT",
//     ]);
//     if (!result) return res.status(400);

//     return res.status(200).json({ ok: true });
//   } catch (error) {
//     console.log(error);
//     res.status(500).json(error);
//   }
// });

// stdRoute.post("/create-easy", async (req, res) => {
//   try {
//   } catch (error) {
//     console.error(error);
//   }
// });

stdRoute.post("/create-std", async (req, res) => {
  const client = await pool.connect();
  try {
    const { fullName, studentId, username, password } = req.body;

    if (!fullName || !studentId || !username || !password) {
      return res.status(400).json({ err: "กรอกข้อมูลไม่ครบ" });
    }

    await client.query("BEGIN");

    // 🔹 เช็คซ้ำ student
    const checkStd = await client.query(
      "SELECT * FROM students WHERE std_class_id = $1",
      [studentId]
    );
    if (checkStd.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.json({ err: "มีรหัสนักศึกษานี้แล้ว" });
    }

    // 🔹 เช็คซ้ำ username
    const checkUser = await client.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );
    if (checkUser.rows.length > 0) {
      await client.query("ROLLBACK");
      return res.json({ err: "username ซ้ำ" });
    }

    // 🔹 insert users
    await client.query(
      "INSERT INTO users (username,password,role_id) VALUES ($1,$2,$3)",
      [username, password, 1]
    );

    // 🔹 insert students
    await client.query(
      `INSERT INTO students 
  (fullname,std_class_id,username,password,major,profile) 
  VALUES ($1,$2,$3,$4,$5,$6)`,
      [fullName, studentId, username, password, "IT", "default.png"]
    );
    await client.query("COMMIT");

    return res.status(200).json({ ok: true });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    return res.status(500).json({ err: "สมัครไม่สำเร็จ" });
  } finally {
    client.release();
  }
});

// stdRoute.post("/login", async (req, res) => {
//   try {
//     const { username, password } = req.body;

//     console.log("login:", username, password);

//     let role = 1;
//     let query = "SELECT * FROM students WHERE username = $1";
//     let result = await pool.query(query, [username]);

//     if (result.rows.length > 0) {
//       if (result.rows[0].password !== password) {
//         return res.status(401).json({ err: "password incorrect" });
//       }
//     } else {
//       query = "SELECT * FROM professors WHERE username = $1";
//       role = 2;
//       result = await pool.query(query, [username]);

//       if (result.rows.length === 0) {
//         return res.status(401).json({ err: "user not found" });
//       }

//       if (result.rows[0].password !== password) {
//         return res.status(401).json({ err: "password incorrect" });
//       }
//     }

//     return res.status(200).json({
//       data: { ...result.rows[0], role },
//     });
//   } catch (error) {
//     console.error(error);
//     return res.status(500).json({ err: "Internal server error" });
//   }
// });

stdRoute.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    console.log("login:", username, password);

    // 🔹 1. หาใน students
    let result = await pool.query(
      "SELECT * FROM students WHERE username = $1",
      [username]
    );

    if (result.rows.length > 0) {
      if (result.rows[0].password !== password) {
        return res.status(401).json({ err: "password incorrect" });
      }

      return res.status(200).json({
        data: { ...result.rows[0], role: 1 },
      });
    }

    // 🔹 2. หาใน professors
    result = await pool.query(
      "SELECT * FROM professors WHERE username = $1",
      [username]
    );

    if (result.rows.length > 0) {
      if (result.rows[0].password !== password) {
        return res.status(401).json({ err: "password incorrect" });
      }

      return res.status(200).json({
        data: { ...result.rows[0], role: 2 },
      });
    }

    // 🔹 3. หาใน users (admin หรือ user อื่น)
    result = await pool.query(
      "SELECT * FROM users WHERE username = $1",
      [username]
    );

    if (result.rows.length > 0) {
      if (result.rows[0].password !== password) {
        return res.status(401).json({ err: "password incorrect" });
      }

      return res.status(200).json({
        data: { ...result.rows[0], role: result.rows[0].role_id },
      });
    }

    // ❌ ไม่เจอเลย
    return res.status(401).json({ err: "user not found" });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ err: "Internal server error" });
  }
});

stdRoute.put("/students/:id", upload.single("profile"), async (req, res) => {
  try {
    const { id } = req.params;
    const { fullname, major } = req.body;
    const filePath = req.file ? req.file.path : null;

    if (!id) {
      return res.status(400).json({ err: "กรุณาระบุ id" });
    }

    if (!fullname && !major && !filePath) {
      return res.status(400).json({
        err: "ต้องมีอย่างน้อย fullname หรือ major หรือ profile",
      });
    }

    // 🔹 ดึงรูปเก่า
    const qSelect = "SELECT profile FROM students WHERE student_id = $1";
    const student = await pool.query(qSelect, [id]);

    if (student.rows.length === 0) {
      return res.status(404).json({ err: "ไม่พบนักเรียน" });
    }

    const oldProfile = student.rows[0].profile;

    // 🔥 ลบรูปเก่า ถ้ามีการอัปโหลดรูปใหม่
    if (filePath && oldProfile) {
      const oldPath = path.resolve(oldProfile);
      if (fs.existsSync(oldPath)) {
        await fs.promises.unlink(oldPath);
      }
    }

    // 🔹 update ข้อมูล
    const query = `
      UPDATE students
      SET
        fullname = COALESCE($1, fullname),
        major = COALESCE($2, major),
        profile = COALESCE($3, profile)
      WHERE student_id = $4
      RETURNING *
    `;

    const result = await pool.query(query, [
      fullname,
      major,
      filePath,
      Number(id),
    ]);

    return res.status(200).json({
      ok: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ err: "Internal server error" });
  }
});

stdRoute.get("/students/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ err: "กรุณาระบุ id" });
    }

    const query = `
      SELECT student_id, fullname, std_class_id, username, major,profile
      FROM students
      WHERE student_id = $1
      LIMIT 1
    `;

    const result = await pool.query(query, [id]);
    console.log(result.rows);
    if (result.rows.length === 0) {
      return res.status(404).json({ err: "ไม่พบข้อมูลนักเรียน" });
    }

    return res.status(200).json({ data: result.rows[0] });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ err: "Internal server error" });
  }
});

stdRoute.delete("/students/:id", async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ err: "กรุณาระบุ id" });
    }

    await client.query("BEGIN");

    // 1. ลบข้อมูลลูกก่อน
    await client.query("DELETE FROM enrollments WHERE student_id = $1", [id]);

    // 2. ลบนักเรียน (ต้องมี RETURNING)
    const result = await client.query(
      `
      DELETE FROM students
      WHERE student_id = $1
      RETURNING student_id
      `,
      [id],
    );

    if (result.rows.length === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ err: "ไม่พบข้อมูลนักเรียน" });
    }

    await client.query("COMMIT");

    return res.status(200).json({
      ok: true,
      msg: "ลบข้อมูลเรียบร้อย",
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(error);
    return res.status(500).json({ err: "Internal server error" });
  } finally {
    client.release();
  }
});

stdRoute.get("/students", async (req, res) => {
  try {
    const query = `
   SELECT
  student_id,
  fullname,
  std_class_id,
  username,
  major
FROM students 

    `;

    const result = await pool.query(query);
    console.log("🚀 ~ result.rows:", result.rows);
    return res.status(200).json({
      total: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ err: "Internal server error" });
  }
});

// stdRoute.post("/check-class", async (req, res) => {
//   try {
//     const { classId, stdId } = req.body;
//     const filePath = req.file ? req.file.path : null;

//     if (!classId || !stdId) {
//       return res.status(400).json({ err: "ข้อมูลไม่ครบ" });
//     }

//     // 🔹 ใช้เวลา server
//     const checkinTime = new Date();

//     // 🔹 ดึงเวลาเข้าเรียนจาก courses
//     const courseResult = await pool.query(
//       `SELECT time_check FROM courses WHERE course_id = $1`,
//       [classId],
//     );

//     if (courseResult.rows.length === 0) {
//       return res.status(404).json({ err: "ไม่พบวิชาเรียน" });
//     }

//     const timeCheck = courseResult.rows[0].time_check; // TIME

//     // 🔹 ดึงเฉพาะเวลา (HH:mm:ss) จาก checkinTime
//     const checkinTimeOnly = checkinTime.toTimeString().slice(0, 8); // "HH:mm:ss"

//     // 🔥 ตัดสินสถานะ
//     const status = checkinTimeOnly > timeCheck ? "มาสาย" : "ตรงเวลา";

//     // 🔹 บันทึกข้อมูล
//     const query = `
//         INSERT INTO attendance
//         (course_id, student_id, checkin_time, status, leave_file)
//         VALUES ($1, $2, NOW(), $3, $4)
//       `;

//     await pool.query(query, [classId, stdId, status, filePath]);

//     res.json({
//       ok: true,
//       status,
//       checkin_time: checkinTime,
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ err: "Check-in failed" });
//   }
// });

stdRoute.post("/check-class", upload.single("leavDoc"), async (req, res) => {
  try {
    const { classId, stdId } = req.body;
    const filePath = req.file ? req.file.path : null;

    if (!classId || !stdId) {
      return res.status(400).json({ err: "ข้อมูลไม่ครบ" });
    }

    // ✅ เช็คว่า enroll แล้วหรือยัง
    const enrollCheck = await pool.query(
      `SELECT * FROM enrollments WHERE student_id = $1 AND course_id = $2`,
      [stdId, classId]
    );

    // 🔥 ถ้ายังไม่ enroll → สมัครให้เลย
    if (enrollCheck.rows.length === 0) {
      await pool.query(
        `INSERT INTO enrollments (student_id, course_id) VALUES ($1, $2)`,
        [stdId, classId]
      );
    }

    const checkinTime = new Date();

    const courseResult = await pool.query(
      `SELECT time_check FROM courses WHERE course_id = $1`,
      [classId]
    );

    if (courseResult.rows.length === 0) {
      return res.status(404).json({ err: "ไม่พบวิชาเรียน" });
    }

    const timeCheck = courseResult.rows[0].time_check;
    const checkinTimeOnly = checkinTime.toTimeString().slice(0, 8);

    const status = checkinTimeOnly > timeCheck ? "มาสาย" : "มาเรียน";

    // ✅ กันกดซ้ำ (สำคัญมาก)
    const alreadyCheck = await pool.query(
      `SELECT * FROM attendance 
       WHERE student_id = $1 AND course_id = $2 AND DATE(checkin_time) = CURRENT_DATE`,
      [stdId, classId]
    );

    if (alreadyCheck.rows.length > 0) {
      return res.status(400).json({ err: "เช็คชื่อไปแล้ววันนี้" });
    }

    await pool.query(
      `INSERT INTO attendance
       (course_id, student_id, checkin_time, status, leave_file)
       VALUES ($1, $2, NOW(), $3, $4)`,
      [classId, stdId, status, filePath]
    );

    res.json({
      ok: true,
      status,
      checkin_time: checkinTime,
    });
  } catch (err) {
    console.error("🔥 CHECK CLASS ERROR:", err);
    res.status(500).json({ err: "Check-in failed" });
  }
});

//ลงทะเบียนวิชาเรียน
stdRoute.post("/enroll", async (req, res) => {
  try {
    const { student_id, course_id } = req.body;

    if (!student_id || !course_id) {
      return res.json({ err: "ข้อมูลไม่ครบ" });
    }

    // 🔹 กันลงซ้ำ
    const check = await pool.query(
      "SELECT * FROM enrollments WHERE student_id=$1 AND course_id=$2",
      [student_id, course_id]
    );

    if (check.rows.length > 0) {
      return res.json({ err: "ลงทะเบียนแล้ว" });
    }

    // 🔹 insert
    await pool.query(
      "INSERT INTO enrollments (student_id, course_id) VALUES ($1,$2)",
      [student_id, course_id]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ err: "Enroll failed" });
  }
});

// เพิ่ม route ใหม่: ดึง attendance วันนี้ของห้องเรียน
stdRoute.get("/attendance-today/:classId", async (req, res) => {
  try {
    const { classId } = req.params;

    const result = await pool.query(
      `SELECT 
         a.attendance_id,
         a.student_id,
         s.fullname,
         s.std_class_id,
         a.checkin_time,
         a.status,
         a.leave_file
       FROM attendance a
       JOIN students s ON s.student_id = a.student_id
       WHERE a.course_id = $1
         AND DATE(a.checkin_time) = CURRENT_DATE
       ORDER BY a.checkin_time ASC`,
      [classId]
    );

    return res.status(200).json({
      total: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ err: "Internal server error" });
  }
});

export default stdRoute;