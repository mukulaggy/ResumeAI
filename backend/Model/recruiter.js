const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const recruiterSchema = new mongoose.Schema({
  companyName: { type: String, required: true },
  recruiterName: { type: String, required: true },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

// Hash password before saving
recruiterSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password
recruiterSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model("Recruiter", recruiterSchema);