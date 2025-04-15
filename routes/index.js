const express = require("express");
const router = express.Router();

// Landing page with buttons for student & teacher
router.get("/", (req, res) => {
  res.render("landing");
});

module.exports = router;
