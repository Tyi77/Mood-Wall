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

    // Local state for messages and pagination
    let localMessages = [];
    let lastDoc = null;
    let hasMore = true;
    const PAGE_LIMIT = 20;

    // Load initial messages on page load
    fetchMessages(false);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const content = input.value.trim();
        if (!content) return;

        submitBtn.disabled = true;
        submitBtn.textContent = '送出中...';

        try {
            // Find the maximum original_id in Firestore to continue the sequence
            // This consumes only 1 read because of .limit(1) and indexing
            let nextId = 1;
            const querySnapshot = await messagesRef.orderBy('original_id', 'desc').limit(1).get();
            if (!querySnapshot.empty) {
                const maxDoc = querySnapshot.docs[0].data();
                if (maxDoc.original_id !== undefined && maxDoc.original_id !== null) {
                    nextId = Number(maxDoc.original_id) + 1;
                }
            }

            // Create temporary ID for optimistic UI update
            const tempId = 'temp-' + Date.now();
            const newMsg = {
                id: tempId,
                content: content,
                created_at: { toDate: () => new Date() }, // Mock toDate for instant rendering
                original_id: nextId
            };

            // 1. Optimistic Update: Add to the top of our local state immediately
            localMessages.unshift(newMsg);
            renderMessages(localMessages);

            // 2. Clear input immediately for instant responsiveness
            input.value = '';

            // 3. Perform write in the background (0 reads, 1 write)
            const docRef = await messagesRef.add({
                content: content,
                created_at: firebase.firestore.FieldValue.serverTimestamp(),
                original_id: nextId
            });

            // 4. Update the temporary ID with the real Firestore ID
            const tempIndex = localMessages.findIndex(m => m.id === tempId);
            if (tempIndex !== -1) {
                localMessages[tempIndex].id = docRef.id;
            }
        } catch (error) {
            console.error('Error posting message:', error);
            alert('發生錯誤，無法送出留言。(' + error.code + ')');
            // Re-fetch in case of error to sync state
            await fetchMessages(false);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = '送出留言';
        }
    });

    async function fetchMessages(isLoadMore = false) {
        try {
            let query = messagesRef.orderBy('created_at', 'desc').limit(PAGE_LIMIT);
            
            if (isLoadMore && lastDoc) {
                query = messagesRef.orderBy('created_at', 'desc').startAfter(lastDoc).limit(PAGE_LIMIT);
            }

            const snapshot = await query.get();
            
            if (snapshot.empty) {
                if (!isLoadMore) {
                    localMessages = [];
                    hasMore = false;
                    renderMessages(localMessages);
                } else {
                    hasMore = false;
                    renderMessages(localMessages); // Re-render to update the Load More button
                }
                return;
            }

            // Save the last document for pagination
            lastDoc = snapshot.docs[snapshot.docs.length - 1];
            hasMore = snapshot.docs.length === PAGE_LIMIT;

            const fetchedMessages = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            if (isLoadMore) {
                localMessages = [...localMessages, ...fetchedMessages];
            } else {
                localMessages = fetchedMessages;
            }

            renderMessages(localMessages);
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
                        const targetId = msg.id;

                        // 1. Optimistic Update: Remove from local state immediately
                        localMessages = localMessages.filter(m => m.id !== targetId);
                        renderMessages(localMessages);

                        // 2. Perform delete in the background (0 reads, 1 write)
                        await messagesRef.doc(targetId).delete();
                    } catch (error) {
                        console.error('Error deleting message:', error);
                        alert('發生錯誤，無法刪除留言。');
                        // Re-fetch in case of error to sync state
                        await fetchMessages(false);
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

        // Add a beautiful Load More button if there are more messages to load
        if (hasMore) {
            const loadMoreBtn = document.createElement('button');
            loadMoreBtn.className = 'load-more-btn';
            loadMoreBtn.style.marginTop = '20px';
            loadMoreBtn.textContent = '載入更多留言';
            loadMoreBtn.onclick = async () => {
                loadMoreBtn.disabled = true;
                loadMoreBtn.textContent = '載入中...';
                await fetchMessages(true);
            };
            container.appendChild(loadMoreBtn);
        }
    }
});
