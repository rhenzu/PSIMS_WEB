const mongoose = require('mongoose');

const studentUploadSchema = new mongoose.Schema({
    event: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'ActivityEvent',
        required: true
    },
    scholar: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Scholar',
        required: true
    },
    photoBase64: {
        type: String,
        required: [true, 'Photo is required.']
    },
    photoMimeType: {
        type: String,
        required: [true, 'Photo MIME type is required.']
    },
    uploadedAt: {
        type: Date,
        default: Date.now
    }
}, {
    collection: 'student_uploads',
    timestamps: false
});

// Ensure one upload per scholar per event
studentUploadSchema.index({ event: 1, scholar: 1 }, { unique: true });

module.exports = mongoose.model('StudentUpload', studentUploadSchema);
