import { Router } from "express";
import pool from "../config/pg.js";
import upload from "../middleware/upload.js";
import fs from "fs";
import path from "path";

const stdRoute = Router();

// ✅ Validation Helper Functions
const validateUsername = (username) => {
  const errors = [];
  
  if (!username || !username.trim()) {
    errors.push("กรุณากรอกชื่อผู้ใช้");
  } else {
    if (username.length < 3) {
      errors.push("ชื่อผู้ใช้ต้องมีอย่างน้อย 3 ตัวอักษร");
    }
    if (username.length > 50) {
      errors.push("ชื่อผู้ใช้ต้องไม่เกิน 50 ตัวอักษร");
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      errors.push("ชื่อผู้ใช้ต้องเป็นตัวอักษร ตัวเลข หรือ _ เท่านั้น");
    }
  }
  
  return errors;
};

const validatePassword = (password) => {
  const errors = [];
  
  if (!password) {
    errors.push("กรุณากรอกรหัสผ่าน");
  } else {
    if (password.length < 4) {
      errors.push("รหัสผ่านต้องมีอย่างน้อย 4 ตัวอักษร");
    }
    if (password.length > 100) {
      errors.push("รหัสผ่านต้องไม่เกิน 100 ตัวอักษร");
    }
  }
  
  return errors;
};

const validateFullName = (fullName) => {
  const errors = [];
  
  if (!fullName || !fullName.trim()) {
    errors.push("กรุณากรอกชื่อ-นามสกุล");
  } else {
    if (fullName.trim().length < 2) {
      errors.push("ชื่อ-นามสกุลต้องมีอย่างน้อย 2 ตัวอักษร");
    }
    if (fullName.length > 100) {
      errors.push("ชื่อ-นามสกุลต้องไม่เกิน 100 ตัวอักษร");
    }
  }
  
  return errors;
};

const validateStudentId = (studentId) => {
  const errors = [];
  
  if (!studentId || !studentId.trim()) {
    errors.push("กรุณากรอกรหัสนักศึกษา");
  } else {
    if (studentId.trim().length < 5) {
      errors.push("รหัสนักศึกษาต้องมีอย่างน้อย 5 ตัวอักษร");
    }
    if (studentId.length > 20) {
      errors.push("รหัสนักศึกษาต้องไม่เกิน 20 ตัวอักษร");
    }
  }
  
  return errors;
};

stdRoute.post("/create-std", async (req, res) => {
  try {
    const { fullName, studentId, username, password } = req.body;

    // ✅ Validate ข้อมูลทั้งหมด
    const validationErrors = [];
    
    validationErrors.push(...validateFullName(fullName));
    validationErrors.push(...validateStudentId(studentId));
    validationErrors.push(...validateUsername(username));
    validationErrors.push(...validatePassword(password));

    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        err: validationErrors.join(", "),
        errors: validationErrors 
      });
    }

    // ตรวจสอบรหัสนักศึกษาซ้ำ
    const isStdExit = `SELECT * FROM students WHERE std_class_id = $1`;
    const findStdIdEsit = await pool.query(isStdExit, [studentId.trim()]);
    if (findStdIdEsit.rows.length > 0) {
      return res.status(400).json({
        err: "มีข้อมูลรหัสนักศึกษานี้อยู่แล้ว ไม่สามารถลงทะเบียนได้",
      });
    }

    // ตรวจสอบ username ซ้ำ
    const where = `SELECT * FROM students WHERE username = $1`;
    const fintExitStd = await pool.query(where, [username.trim()]);
    if (fintExitStd.rows.length > 0) {
      return res.status(400).json({
        err: "มีข้อมูล username นี้อยู่แล้ว ไม่สามารถลงทะเบียนได้",
      });
    }

    // สร้างข้อมูล student
    const query = `INSERT INTO students (fullname, std_class_id, username, password, major) 
                   VALUES ($1, $2, $3, $4, $5) RETURNING *`;

    const result = await pool.query(query, [
      fullName.trim(),
      studentId.trim(),
      username.trim(),
      password, // ควรใช้ bcrypt hash ในการ production
      "IT",
    ]);

    if (!result || result.rows.length === 0) {
      return res.status(400).json({ err: "ไม่สามารถสร้างข้อมูลได้" });
    }

    return res.status(200).json({
      ok: true,
      message: "ลงทะเบียนสำเร็จ",
      data: {
        student_id: result.rows[0].student_id,
        fullname: result.rows[0].fullname,
        username: result.rows[0].username,
      },
    });
  } catch (error) {
    console.error("❌ Error in /create-std:", error);
    res.status(500).json({
      err: "เกิดข้อผิดพลาดในการลงทะเบียน",
      details: error.message,
    });
  }
});

stdRoute.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    // ✅ Validate input
    const validationErrors = [];
    
    validationErrors.push(...validateUsername(username));
    validationErrors.push(...validatePassword(password));

    if (validationErrors.length > 0) {
      return res.status(400).json({ 
        err: validationErrors.join(", "),
        errors: validationErrors 
      });
    }

    let role = 1;
    let query = "SELECT * FROM students WHERE username = $1 AND password = $2";

    let result = await pool.query(query, [username.trim(), password]);

    if (result.rows.length < 1) {
      query = "SELECT * FROM professors WHERE username = $1 AND password = $2";
      role = 2;
      result = await pool.query(query, [username.trim(), password]);
    }

    console.log("🚀 ~ query:", query);
    console.log("🚀 ~ result.rows:", result.rows);

    if (result.rows.length === 0) {
      return res.status(401).json({ err: "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง" });
    }

    return res.status(200).json({
      ok: true,
      data: { ...result.rows[0], role },
    });
  } catch (error) {
    console.error("❌ Error in /login:", error);
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

    // ✅ Validate fullname ถ้ามีการส่งมา
    if (fullname) {
      const fullnameErrors = validateFullName(fullname);
      if (fullnameErrors.length > 0) {
        return res.status(400).json({ 
          err: fullnameErrors.join(", "),
          errors: fullnameErrors 
        });
      }
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
      fullname ? fullname.trim() : null,
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
      SELECT student_id, fullname, std_class_id, username, major, profile
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
      [id]
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

stdRoute.post("/check-class", upload.single("leavDoc"), async (req, res) => {
  try {
    const { classId, stdId } = req.body;
    const filePath = req.file ? req.file.path : null;

    if (!classId || !stdId) {
      return res.status(400).json({ err: "ข้อมูลไม่ครบ" });
    }

    // 🔹 ใช้เวลา server
    const checkinTime = new Date();

    // 🔹 ดึงเวลาเข้าเรียนจาก courses
    const courseResult = await pool.query(
      `SELECT time_check FROM courses WHERE course_id = $1`,
      [classId]
    );

    if (courseResult.rows.length === 0) {
      return res.status(404).json({ err: "ไม่พบวิชาเรียน" });
    }

    const timeCheck = courseResult.rows[0].time_check; // TIME

    // 🔹 ดึงเฉพาะเวลา (HH:mm:ss) จาก checkinTime
    const checkinTimeOnly = checkinTime.toTimeString().slice(0, 8); // "HH:mm:ss"

    // 🔥 ตัดสินสถานะ
    const status = checkinTimeOnly > timeCheck ? "มาสาย" : "ตรงเวลา";

    // 🔹 บันทึกข้อมูล
    const query = `
      INSERT INTO attendance
      (course_id, student_id, checkin_time, status, leave_file)
      VALUES ($1, $2, NOW(), $3, $4)
    `;

    await pool.query(query, [classId, stdId, status, filePath]);

    res.json({
      ok: true,
      status,
      checkin_time: checkinTime,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ err: "Check-in failed" });
  }
});

export default stdRoute;