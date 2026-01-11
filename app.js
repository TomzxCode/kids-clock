// Kids Clock App - Main Application Logic

class KidsClockApp {
    constructor() {
        this.events = [];
        this.currentEventId = null;
        this.checkInterval = null;
        this.init();
    }

    init() {
        this.loadEvents();
        this.setupEventListeners();
        this.startClock();
        this.startEventChecker();
        this.renderEvents();
    }

    // Clock Functions
    startClock() {
        this.updateClock();
        setInterval(() => this.updateClock(), 1000);
    }

    updateClock() {
        const now = new Date();

        // Update digital clock
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');

        document.getElementById('hours').textContent = hours;
        document.getElementById('minutes').textContent = minutes;
        document.getElementById('seconds').textContent = seconds;

        // Update date
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        document.getElementById('dateDisplay').textContent = now.toLocaleDateString('en-US', options);

        // Update analog clock
        this.updateAnalogClock(now);
    }

    updateAnalogClock(date) {
        const hours = date.getHours() % 12;
        const minutes = date.getMinutes();
        const seconds = date.getSeconds();

        const hourAngle = (hours * 30) + (minutes * 0.5) - 90;
        const minuteAngle = (minutes * 6) - 90;
        const secondAngle = (seconds * 6) - 90;

        const hourHand = document.getElementById('hourHand');
        const minuteHand = document.getElementById('minuteHand');
        const secondHand = document.getElementById('secondHand');

        if (hourHand) {
            hourHand.setAttribute('transform', `rotate(${hourAngle} 100 100)`);
        }
        if (minuteHand) {
            minuteHand.setAttribute('transform', `rotate(${minuteAngle} 100 100)`);
        }
        if (secondHand) {
            secondHand.setAttribute('transform', `rotate(${secondAngle} 100 100)`);
        }
    }

    // Event Listeners
    setupEventListeners() {
        // Clock type toggle
        document.getElementById('digitalBtn').addEventListener('click', () => {
            this.switchClockType('digital');
        });

        document.getElementById('analogBtn').addEventListener('click', () => {
            this.switchClockType('analog');
        });

        // Modal controls
        document.getElementById('addEventBtn').addEventListener('click', () => {
            this.openModal();
        });

        document.getElementById('closeModal').addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('cancelEventBtn').addEventListener('click', () => {
            this.closeModal();
        });

        document.getElementById('saveEventBtn').addEventListener('click', () => {
            this.saveEvent();
        });

        // Event type change
        document.getElementById('eventType').addEventListener('change', (e) => {
            this.showEventFields(e.target.value);
        });

        // Overlay close
        document.getElementById('closeOverlay').addEventListener('click', () => {
            this.closeOverlay();
        });

        // Picture upload
        document.getElementById('pictureUpload').addEventListener('change', (e) => {
            this.handleFileUpload(e, 'picture');
        });

        // Audio upload
        document.getElementById('audioUpload').addEventListener('change', (e) => {
            this.handleFileUpload(e, 'audio');
        });
    }

    switchClockType(type) {
        const digitalClock = document.getElementById('digitalClock');
        const analogClock = document.getElementById('analogClock');
        const digitalBtn = document.getElementById('digitalBtn');
        const analogBtn = document.getElementById('analogBtn');

        if (type === 'digital') {
            digitalClock.classList.remove('hidden');
            analogClock.classList.add('hidden');
            digitalBtn.classList.add('active');
            analogBtn.classList.remove('active');
        } else {
            digitalClock.classList.add('hidden');
            analogClock.classList.remove('hidden');
            digitalBtn.classList.remove('active');
            analogBtn.classList.add('active');
        }
    }

    // Modal Functions
    openModal() {
        document.getElementById('eventModal').classList.remove('hidden');
        this.resetForm();
    }

    closeModal() {
        document.getElementById('eventModal').classList.add('hidden');
        this.resetForm();
    }

    resetForm() {
        document.getElementById('eventType').value = 'announcement';
        document.getElementById('eventTime').value = '';
        document.getElementById('eventName').value = '';
        document.getElementById('announcementText').value = '';
        document.getElementById('pictureUrl').value = '';
        document.getElementById('audioUrl').value = '';
        document.getElementById('pictureUpload').value = '';
        document.getElementById('audioUpload').value = '';
        document.getElementById('repeatDaily').checked = false;
        this.showEventFields('announcement');
    }

    showEventFields(type) {
        const announcementFields = document.getElementById('announcementFields');
        const pictureFields = document.getElementById('pictureFields');
        const audioFields = document.getElementById('audioFields');

        announcementFields.classList.add('hidden');
        pictureFields.classList.add('hidden');
        audioFields.classList.add('hidden');

        switch(type) {
            case 'announcement':
                announcementFields.classList.remove('hidden');
                break;
            case 'picture':
                pictureFields.classList.remove('hidden');
                break;
            case 'audio':
                audioFields.classList.remove('hidden');
                break;
        }
    }

    handleFileUpload(event, type) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                if (type === 'picture') {
                    document.getElementById('pictureUrl').value = e.target.result;
                } else if (type === 'audio') {
                    document.getElementById('audioUrl').value = e.target.result;
                }
            };
            reader.readAsDataURL(file);
        }
    }

    // Event Management
    saveEvent() {
        const type = document.getElementById('eventType').value;
        const time = document.getElementById('eventTime').value;
        const name = document.getElementById('eventName').value;
        const repeatDaily = document.getElementById('repeatDaily').checked;

        if (!time || !name) {
            alert('Please fill in the required fields: Event Name and Time');
            return;
        }

        const event = {
            id: Date.now(),
            type,
            time,
            name,
            repeatDaily,
            enabled: true
        };

        // Add type-specific data
        switch(type) {
            case 'announcement':
                event.message = document.getElementById('announcementText').value;
                break;
            case 'picture':
                const pictureUrl = document.getElementById('pictureUrl').value;
                if (!pictureUrl) {
                    alert('Please provide a picture URL or upload an image');
                    return;
                }
                event.pictureUrl = pictureUrl;
                break;
            case 'audio':
                const audioUrl = document.getElementById('audioUrl').value;
                if (!audioUrl) {
                    alert('Please provide an audio URL or upload an audio file');
                    return;
                }
                event.audioUrl = audioUrl;
                break;
        }

        this.events.push(event);
        this.saveEvents();
        this.renderEvents();
        this.closeModal();
    }

    deleteEvent(id) {
        if (confirm('Are you sure you want to delete this event?')) {
            this.events = this.events.filter(e => e.id !== id);
            this.saveEvents();
            this.renderEvents();
        }
    }

    renderEvents() {
        const eventsList = document.getElementById('eventsList');

        if (this.events.length === 0) {
            eventsList.innerHTML = '<p class="no-events">No events scheduled yet!</p>';
            return;
        }

        // Sort events by time
        const sortedEvents = [...this.events].sort((a, b) => {
            return a.time.localeCompare(b.time);
        });

        eventsList.innerHTML = sortedEvents.map(event => {
            const typeEmojis = {
                announcement: '📢',
                picture: '🖼️',
                audio: '🎵'
            };

            return `
                <div class="event-card">
                    <div class="event-info">
                        <div class="event-time">${event.time}</div>
                        <div class="event-name">${typeEmojis[event.type]} ${event.name}</div>
                        <div class="event-type">${event.repeatDaily ? 'Repeats daily' : 'One-time event'}</div>
                    </div>
                    <div class="event-actions">
                        <button class="event-action-btn" onclick="app.deleteEvent(${event.id})">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');
    }

    // Event Checking
    startEventChecker() {
        // Check every second
        this.checkInterval = setInterval(() => {
            this.checkEvents();
        }, 1000);
    }

    checkEvents() {
        const now = new Date();
        const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const currentSeconds = now.getSeconds();

        // Only trigger at the start of the minute (when seconds are 0)
        if (currentSeconds !== 0) {
            return;
        }

        this.events.forEach(event => {
            if (event.enabled && event.time === currentTime) {
                this.triggerEvent(event);
            }
        });
    }

    triggerEvent(event) {
        console.log('Triggering event:', event);

        // Play a notification sound if supported
        this.playNotificationSound();

        // Show the event overlay
        this.showEventOverlay(event);

        // If it's not a repeating event, disable it
        if (!event.repeatDaily) {
            event.enabled = false;
            this.saveEvents();
            this.renderEvents();
        }
    }

    playNotificationSound() {
        // Create a simple beep sound
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.frequency.value = 800;
        oscillator.type = 'sine';

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.5);
    }

    showEventOverlay(event) {
        const overlay = document.getElementById('eventOverlay');
        const content = document.getElementById('overlayContent');

        let html = '';

        switch(event.type) {
            case 'announcement':
                html = `
                    <div class="announcement-content">
                        <h2>📢 ${event.name}</h2>
                        <p>${event.message || ''}</p>
                    </div>
                `;
                break;
            case 'picture':
                html = `
                    <div class="picture-content">
                        <h2>🖼️ ${event.name}</h2>
                        <img src="${event.pictureUrl}" alt="${event.name}">
                    </div>
                `;
                break;
            case 'audio':
                html = `
                    <div class="audio-content">
                        <h2>🎵 ${event.name}</h2>
                        <audio controls autoplay>
                            <source src="${event.audioUrl}">
                            Your browser does not support the audio element.
                        </audio>
                    </div>
                `;
                break;
        }

        content.innerHTML = html;
        overlay.classList.remove('hidden');
    }

    closeOverlay() {
        const overlay = document.getElementById('eventOverlay');
        overlay.classList.add('hidden');

        // Stop any playing audio
        const audio = overlay.querySelector('audio');
        if (audio) {
            audio.pause();
            audio.currentTime = 0;
        }
    }

    // Storage Functions
    saveEvents() {
        localStorage.setItem('kidsClockEvents', JSON.stringify(this.events));
    }

    loadEvents() {
        const stored = localStorage.getItem('kidsClockEvents');
        if (stored) {
            try {
                this.events = JSON.parse(stored);
            } catch (e) {
                console.error('Error loading events:', e);
                this.events = [];
            }
        }
    }
}

// Initialize the app
const app = new KidsClockApp();
