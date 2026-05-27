// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyAc1sLk453TLHhYOJfdys58RSq-XNsi0lk",
    authDomain: "mood-wall.firebaseapp.com",
    projectId: "mood-wall",
    storageBucket: "mood-wall.firebasestorage.app",
    messagingSenderId: "836175768246",
    appId: "1:836175768246:web:f7476530beeae713d11417"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const messagesRef = db.collection('messages');

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('moodForm');
    const input = document.getElementById('moodInput');
    const container = document.getElementById('messagesContainer');
    const submitBtn = document.getElementById('submitBtn');

    // Load messages on page load
    fetchMessages();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const content = input.value.trim();
        if (!content) return;

        submitBtn.disabled = true;
        submitBtn.textContent = '送出中...';

        try {
            // Find the maximum original_id in Firestore to continue the sequence
            let nextId = 1;
            const querySnapshot = await messagesRef.orderBy('original_id', 'desc').limit(1).get();
            if (!querySnapshot.empty) {
                const maxDoc = querySnapshot.docs[0].data();
                if (maxDoc.original_id !== undefined && maxDoc.original_id !== null) {
                    nextId = Number(maxDoc.original_id) + 1;
                }
            }

            await messagesRef.add({
                content: content,
                created_at: firebase.firestore.FieldValue.serverTimestamp(),
                original_id: nextId
            });
            input.value = '';
            // Refresh messages after posting
            await fetchMessages();
        } catch (error) {
            console.error('Error posting message:', error);
            alert('發生錯誤，無法送出留言。(' + error.code + ')');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = '送出留言';
        }
    });

    async function fetchMessages() {
        try {
            const snapshot = await messagesRef.get();
            const messages = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Sort by created_at descending (newest first), nulls at top
            messages.sort((a, b) => {
                const timeA = a.created_at ? a.created_at.seconds : Infinity;
                const timeB = b.created_at ? b.created_at.seconds : Infinity;
                return timeB - timeA;
            });

            renderMessages(messages);
        } catch (error) {
            console.error('Error fetching messages:', error);
            container.innerHTML = '<p style="color: #ffb347; text-align: center;">無法載入留言：' + error.code + ' - ' + error.message + '</p>';
        }
    }

    function renderMessages(messages) {
        container.innerHTML = '';

        if (messages.length === 0) {
            container.innerHTML = '<p style="color: var(--text-secondary); text-align: center;">目前還沒有留言，來寫下第一則吧！</p>';
            return;
        }

        messages.forEach(msg => {
            const card = document.createElement('div');
            card.className = 'message-card';

            const content = document.createElement('div');
            content.className = 'message-content';
            content.textContent = msg.content;

            const date = document.createElement('div');
            date.className = 'message-date';

            let timeString = '';
            if (msg.created_at && typeof msg.created_at.toDate === 'function') {
                const localDate = msg.created_at.toDate();
                timeString = localDate.toLocaleString('zh-TW', {
                    year: 'numeric', month: '2-digit', day: '2-digit',
                    hour: '2-digit', minute: '2-digit'
                });
            } else {
                timeString = '剛剛';
            }

            date.textContent = timeString;

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.textContent = '刪除';
            deleteBtn.onclick = async () => {
                if (confirm('確定要刪除這則留言嗎？')) {
                    try {
                        await messagesRef.doc(msg.id).delete();
                        await fetchMessages();
                    } catch (error) {
                        console.error('Error deleting message:', error);
                        alert('發生錯誤，無法刪除留言。');
                    }
                }
            };

            const header = document.createElement('div');
            header.className = 'message-header';
            header.appendChild(date);
            header.appendChild(deleteBtn);

            card.appendChild(header);
            card.appendChild(content);

            container.appendChild(card);
        });
    }
});
