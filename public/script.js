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

    // Pagination & Cache States
    const PAGE_LIMIT = 20;
    let cachedPages = [];        // Array of arrays storing messages per page
    let documentPointers = [null]; // Firestore doc pointers for pagination boundaries
    let currentPage = 0;         // Current active page index (0-indexed)
    let hasMoreInDB = true;      // Is there potentially more data in Firestore?

    // Load initial page (Page 1)
    goToPage(0);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const content = input.value.trim();
        if (!content) return;

        submitBtn.disabled = true;
        submitBtn.textContent = '送出中...';

        try {
            // Find the maximum original_id in Firestore to continue the sequence
            // Consumes only 1 read thanks to index and .limit(1)
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
                created_at: { toDate: () => new Date() }, // Mock toDate for instant local rendering
                original_id: nextId
            };

            // 1. Optimistic Update: Insert into Page 1 Cache locally
            if (!cachedPages[0]) {
                cachedPages[0] = [];
            }
            cachedPages[0].unshift(newMsg);

            // If Page 1 now exceeds the limit, pop the last item to keep it at PAGE_LIMIT
            if (cachedPages[0].length > PAGE_LIMIT) {
                cachedPages[0].pop();
            }

            // 2. Clear subsequent cached pages to keep state clean and consistent when shifted
            cachedPages = [cachedPages[0]];
            documentPointers = [null, cachedPages[0].length > 0 ? documentPointers[1] : null]; 
            hasMoreInDB = true; // Set to true to force refetch next page when navigating

            // 3. Clear input & go/stay on Page 1 with instant render
            input.value = '';
            currentPage = 0;
            renderMessages(cachedPages[0]);
            renderPaginationControls();

            // 4. Perform database write in the background (0 reads, 1 write)
            const docRef = await messagesRef.add({
                content: content,
                created_at: firebase.firestore.FieldValue.serverTimestamp(),
                original_id: nextId
            });

            // 5. Update the temporary ID with the real Firestore ID
            const tempIndex = cachedPages[0].findIndex(m => m.id === tempId);
            if (tempIndex !== -1) {
                cachedPages[0][tempIndex].id = docRef.id;
                // Update the next document pointer for Page 2
                documentPointers[1] = cachedPages[0][cachedPages[0].length - 1];
            }
        } catch (error) {
            console.error('Error posting message:', error);
            alert('發生錯誤，無法送出留言。(' + error.code + ')');
            // Re-fetch Page 1 from network to sync
            cachedPages = [];
            documentPointers = [null];
            hasMoreInDB = true;
            await goToPage(0);
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = '送出留言';
        }
    });

    async function goToPage(pageIndex) {
        if (pageIndex < 0) return;

        // --- OPTIMIZATION (CLIENT-SIDE CACHE) ---
        // If this page's messages are already in memory, display them instantly (0 reads!)
        if (cachedPages[pageIndex]) {
            currentPage = pageIndex;
            renderMessages(cachedPages[pageIndex]);
            renderPaginationControls();
            
            // Scroll smoothly back to top of the comment section
            if (pageIndex > 0) {
                document.querySelector('.wall-section').scrollIntoView({ behavior: 'smooth' });
            }
            return;
        }

        // If we don't have it cached, and we know there is no more data, do nothing
        if (pageIndex > 0 && !hasMoreInDB) return;

        // Fetching next page from Firestore
        const prevPointer = documentPointers[pageIndex];

        try {
            let query = messagesRef.orderBy('created_at', 'desc').limit(PAGE_LIMIT);
            if (prevPointer) {
                query = messagesRef.orderBy('created_at', 'desc').startAfter(prevPointer).limit(PAGE_LIMIT);
            }

            const snapshot = await query.get();

            if (snapshot.empty) {
                hasMoreInDB = false;
                if (pageIndex === 0) {
                    cachedPages[0] = [];
                    currentPage = 0;
                    renderMessages([]);
                    renderPaginationControls();
                } else {
                    // Update controls to disable the Next button since no more pages
                    renderPaginationControls();
                }
                return;
            }

            // Save the boundary pointer for next page
            documentPointers[pageIndex + 1] = snapshot.docs[snapshot.docs.length - 1];
            hasMoreInDB = snapshot.docs.length === PAGE_LIMIT;

            const pageMessages = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Store in our memory cache
            cachedPages[pageIndex] = pageMessages;
            currentPage = pageIndex;

            renderMessages(pageMessages);
            renderPaginationControls();

            // Smooth scroll on page change
            if (pageIndex > 0) {
                document.querySelector('.wall-section').scrollIntoView({ behavior: 'smooth' });
            }
        } catch (error) {
            console.error('Error fetching page:', error);
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

                        // 1. Optimistic Update: Remove from local cache immediately
                        cachedPages[currentPage] = cachedPages[currentPage].filter(m => m.id !== targetId);
                        
                        // Clear subsequent caches to preserve correctness
                        cachedPages = cachedPages.slice(0, currentPage + 1);
                        documentPointers = documentPointers.slice(0, currentPage + 2);
                        if (cachedPages[currentPage].length > 0) {
                            documentPointers[currentPage + 1] = cachedPages[currentPage][cachedPages[currentPage].length - 1];
                        }
                        hasMoreInDB = true;

                        // Render immediately
                        renderMessages(cachedPages[currentPage]);
                        renderPaginationControls();

                        // If the page became empty, go to the previous page if available
                        if (cachedPages[currentPage].length === 0 && currentPage > 0) {
                            goToPage(currentPage - 1);
                        }

                        // 2. Perform delete in the background (0 reads, 1 write)
                        await messagesRef.doc(targetId).delete();
                    } catch (error) {
                        console.error('Error deleting message:', error);
                        alert('發生錯誤，無法刪除留言。');
                        // Re-fetch current page to sync state on error
                        cachedPages = cachedPages.slice(0, currentPage);
                        await goToPage(currentPage);
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

    function renderPaginationControls() {
        const topContainer = document.getElementById('paginationTop');
        const bottomContainer = document.getElementById('paginationBottom');

        // Clear both containers
        topContainer.innerHTML = '';
        bottomContainer.innerHTML = '';

        // If there are no messages, don't show pagination UI at all
        if (!cachedPages[0] || cachedPages[0].length === 0) {
            return;
        }

        const createControls = () => {
            const wrapper = document.createElement('div');
            wrapper.className = 'pagination-wrapper';

            const prevBtn = document.createElement('button');
            prevBtn.className = 'pag-btn';
            prevBtn.innerHTML = '&lt;'; // '<'
            prevBtn.disabled = currentPage === 0;
            prevBtn.onclick = () => goToPage(currentPage - 1);

            const indicator = document.createElement('span');
            indicator.className = 'pag-indicator';
            indicator.textContent = `第 ${currentPage + 1} 頁`;

            const nextBtn = document.createElement('button');
            nextBtn.className = 'pag-btn';
            nextBtn.innerHTML = '&gt;'; // '>'
            nextBtn.disabled = !hasMoreInDB && currentPage === (cachedPages.length - 1);
            nextBtn.onclick = () => goToPage(currentPage + 1);

            wrapper.appendChild(prevBtn);
            wrapper.appendChild(indicator);
            wrapper.appendChild(nextBtn);

            return wrapper;
        };

        topContainer.appendChild(createControls());
        bottomContainer.appendChild(createControls());
    }
});
