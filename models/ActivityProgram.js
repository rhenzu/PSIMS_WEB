const mongoose = require('mongoose');

const activityProgramSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Program Title cannot be empty.']
    },
    description: {
        type: String
    },
    imageBase64: {
        type: String
    },
    imageMimeType: {
        type: String // Store the MIME type (e.g., "image/jpeg", "image/png")
    },
    startDate: {
        type: Date,
        required: [true, 'Start Date is required.']
    },
    endDate: {
        type: Date,
        required: [true, 'End Date is required.']
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    collection: 'activity_programs',
    timestamps: false
});

activityProgramSchema.pre('validate', function(next) {
    if (this.endDate < this.startDate) {
        next(new Error('End Date cannot be before Start Date.'));
    } else {
        next();
    }
});

module.exports = mongoose.model('ActivityProgram', activityProgramSchema);