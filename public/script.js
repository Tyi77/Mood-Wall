document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('moodForm');
    const input = document.getElementById('moodInput');
    const container = document.getElementById('messagesContainer');
    const submitBtn = document.getElementById('submitBtn');

    // Fetch and display messages on load
    fetchMessages();

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const content = input.value.trim();
        if (!content) return;

        submitBtn.disabled = true;
        submitBtn.textContent = '送出中...';

        try {
            const res = await fetch('/api/messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ content })
            });

            if (res.ok) {
                input.value = '';
                // Refresh messages
                await fetchMessages();
            } else {
                alert('留言送出失敗，請稍後再試。');
            }
        } catch (error) {
            console.error('Error posting message:', error);
            alert('發生錯誤，無法送出留言。');
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = '送出留言';
        }
    });

    async function fetchMessages() {
        try {
            const res = await fetch('/api/messages');
            const data = await res.json();
            
            if (res.ok) {
                renderMessages(data.messages);
            }
        } catch (error) {
            console.error('Error fetching messages:', error);
            container.innerHTML = '<p style="color: #ffb347; text-align: center;">無法載入留言，請檢查網路連線。</p>';
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
            content.textContent = msg.content; // Use textContent to prevent XSS
            
            const date = document.createElement('div');
            date.className = 'message-date';
            
            // Handle date parsing safely. SQLite returns 'YYYY-MM-DD HH:MM:SS' in UTC
            let timeString = '';
            if (msg.created_at) {
                let dateStr = msg.created_at;
                if (!dateStr.includes('T')) {
                    dateStr = dateStr.replace(' ', 'T') + 'Z';
                }
                const localDate = new Date(dateStr);
                if (!isNaN(localDate.getTime())) {
                    timeString = localDate.toLocaleString('zh-TW', {
                        year: 'numeric', month: '2-digit', day: '2-digit',
                        hour: '2-digit', minute: '2-digit'
                    });
                } else {
                    timeString = msg.created_at;
                }
            }

            date.textContent = timeString;

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-btn';
            deleteBtn.textContent = '刪除';
            deleteBtn.onclick = async () => {
                if (confirm('確定要刪除這則留言嗎？')) {
                    try {
                        const deleteRes = await fetch(`/api/messages/${msg.id}`, {
                            method: 'DELETE'
                        });
                        if (deleteRes.ok) {
                            await fetchMessages();
                        } else {
                            alert('刪除失敗');
                        }
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
