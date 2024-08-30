const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const User = require("./models/User");
const Post = require("./models/Post");
const bcrypt = require("bcryptjs");
const app = express();
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const cloudinary = require("./utils/cloudinary");
const fs = require("fs");
const streamifier = require("streamifier");
require("dotenv").config();
const salt = bcrypt.genSaltSync(10);
const secret = "asdfe45we45w345wegw345werjktjwertkj";

app.use(cors({ credentials: true, origin: "http://localhost:3000" }));
app.use(express.json());
app.use(cookieParser());

mongoose.connect(process.env.MONGODB_URI);
const multer = require("multer");
const storage = multer.memoryStorage(); // Store files in memory
const uploadMiddleware = multer({ storage }); // Use memory storage
const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: "uploads" }, // optional folder path in Cloudinary
      (error, result) => {
        if (result) {
          resolve(result);
        } else {
          reject(error);
        }
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

app.post("/api/register", async (req, res) => {
  const { username, password } = req.body;
  try {
    const userDoc = await User.create({
      username,
      password: bcrypt.hashSync(password, salt),
    });
    res.json(userDoc);
  } catch (e) {
    console.log(e);
    res.status(400).json(e);
  }
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const userDoc = await User.findOne({ username });
  const passOk = bcrypt.compareSync(password, userDoc?.password);
  if (passOk) {
    jwt.sign({ username, id: userDoc._id }, secret, {}, (err, token) => {
      if (err) throw err;
      res.cookie("token", token).json({
        id: userDoc._id,
        username,
      });
    });
  } else {
    res.status(400).json("wrong credentials");
  }
});

app.get("/api/profile", (req, res) => {
  const { token } = req.cookies;

  if (!token) {
    return res.status(401).json({ error: "JWT must be provided" });
  }

  jwt.verify(token, secret, {}, (err, info) => {
    if (err) return res.status(403).json({ error: "Invalid JWT token" });
    res.json(info);
  });
});

app.post("/api/logout", (req, res) => {
  res.cookie("token", "").json("ok");
});

app.post("/api/post", uploadMiddleware.single("file"), async (req, res) => {
  const { token } = req.cookies;

  if (!token) {
    return res.status(401).json({ error: "JWT must be provided" });
  }

  jwt.verify(token, secret, {}, async (err, info) => {
    if (err) return res.status(403).json({ error: "Invalid JWT token" });

    const { title, summary, content } = req.body;
    const fileBuffer = req.file.buffer;
    const uploadResult = await uploadToCloudinary(fileBuffer);

    const postDoc = await Post.create({
      title,
      summary,
      content,
      cover: uploadResult.secure_url,
      author: info.id,
    });
    res.json(postDoc);
  });
});

app.put("/api/post", uploadMiddleware.single("file"), async (req, res) => {
  const { token } = req.cookies;

  if (!token) {
    return res.status(401).json({ error: "JWT must be provided" });
  }

  jwt.verify(token, secret, {}, async (err, info) => {
    if (err) return res.status(403).json({ error: "Invalid JWT token" });

    const { id, title, summary, content } = req.body;
    const postDoc = await Post.findById(id);
    const isAuthor = JSON.stringify(postDoc.author) === JSON.stringify(info.id);
    if (!isAuthor) {
      return res.status(400).json("You are not the author");
    }

    let coverUrl = postDoc.cover;
    if (req.file) {
      const fileBuffer = req.file.buffer;
      const uploadResult = await uploadToCloudinary(fileBuffer);
      coverUrl = uploadResult.secure_url;
    }

    await postDoc.update({
      title,
      summary,
      content,
      cover: coverUrl,
    });

    res.json(postDoc);
  });
});
app.get("/api/post", async (req, res) => {
  res.json(
    await Post.find()
      .populate("author", ["username"])
      .sort({ createdAt: -1 })
      .limit(20)
  );
});

app.get("/api/post/:id", async (req, res) => {
  const { id } = req.params;
  const postDoc = await Post.findById(id).populate("author", ["username"]);
  res.json(postDoc);
});

app.listen(4000);
