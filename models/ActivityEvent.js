const mongoose = require('mongoose');

const activityEventSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Event Title cannot be empty.']
    },
    heldDate: {
        type: Date,
        required: [true, 'Held Date is required.']
    },
    bannerBase64: {
        type: String // Base64 encoded banner image
    },
    bannerMimeType: {
        type: String // e.g., "image/jpeg"
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
}, {
    collection: 'activity_events',
    timestamps: false
});

module.exports = mongoose.model('ActivityEvent', activityEventSchema);
