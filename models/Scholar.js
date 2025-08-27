const mongoose = require('mongoose');

const PayrollRecordSchema = new mongoose.Schema({
    SchoolYear: { type: String, required: true },
    IssuedDate: { type: Date, required: true },
    DistributedDate: { type: Date },
    PayrollNumber: { type: String, required: true }
});

const ScholarSchema = new mongoose.Schema({
    FirstName: { type: String, required: true },
    MiddleName: { type: String },
    LastName: { type: String, required: true },
    BirthDate: { type: Date, required: true },
    Sex: { type: String, required: true },
    StudentId: { type: String, required: true },
    Address: { type: String, required: true },
    ContactNumber: { type: String, required: true },
    Email: { type: String, required: true },
    SchoolType: { type: String, required: true },
    SchoolLevel: { type: String, required: true },
    SchoolName: { type: String, required: true },
    YearLevel: { type: String, required: true },
    AverageGrade: { type: Number, required: true },
    EnrollmentDate: { type: Date, required: true },
    GraduationStatus: { type: String, required: true },
    GraduationDate: { type: Date },
    InitializationCode: { type: String, required: true },
  // --- NEW FIELDS FOR PASSWORD RESET ---
    resetPasswordToken: String,
    resetPasswordExpires: Date,
    // --- END NEW FIELDS ---
    PayrollNumber: { type: String },
    PayrollRequestStatus: { type: String },
    PayrollHistory: [PayrollRecordSchema],
    RenewalStatus: { type: String, required: true },
    RenewalDate: { type: Date },
    Username: { type: String, required: true },
    Password: { type: String }, // NOT required, as it’s set during initialization
    LastPayrollRequestDate: { type: Date },
    StagedPayroll: PayrollRecordSchema
}, { collection: 'Scholars' }); // Explicitly specify the collection name

module.exports = mongoose.model('Scholar', ScholarSchema);