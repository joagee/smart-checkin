// 数据管理模块
const DataManager = {
    // 初始化数据
    init() {
        if (!localStorage.getItem('students')) localStorage.setItem('students', '[]');
        if (!localStorage.getItem('logs')) localStorage.setItem('logs', '[]');
        if (!localStorage.getItem('leaves')) localStorage.setItem('leaves', '[]');
        if (!localStorage.getItem('sessionStart')) localStorage.setItem('sessionStart', new Date().getTime().toString());
        if (!localStorage.getItem('lastResetDate')) localStorage.setItem('lastResetDate', new Date().toISOString().split('T')[0]);
        const students = JSON.parse(localStorage.getItem('students'));
        const updated = students.map(s => {
            if (!s.initials) {
                const initials = this.computeInitials(s.name);
                return { ...s, initials };
            }
            return s;
        });
        localStorage.setItem('students', JSON.stringify(updated));
    },

    // 获取所有学生
    getStudents() {
        return JSON.parse(localStorage.getItem('students'));
    },

    // 添加学生 (支持批量)
    addStudents(names) {
        const current = this.getStudents();
        const newStudents = [];
        
        names.forEach(name => {
            const cleanName = name.trim();
            if (cleanName && !current.some(s => s.name === cleanName)) {
                newStudents.push({
                    id: Date.now() + Math.random().toString(36).substr(2, 9),
                    name: cleanName,
                    addedAt: Date.now(),
                    initials: this.computeInitials(cleanName)
                });
            }
        });

        localStorage.setItem('students', JSON.stringify([...current, ...newStudents]));
        return newStudents.length;
    },

    // 删除学生
    deleteStudent(name) {
        const students = this.getStudents().filter(s => s.name !== name);
        localStorage.setItem('students', JSON.stringify(students));
    },

    // 修改学生姓名 (同步更新签到记录与请假记录)
    renameStudent(oldName, newName) {
        const cleanName = newName.trim();
        if (!cleanName || cleanName === oldName) return false;
        const students = this.getStudents();
        if (students.some(s => s.name === cleanName)) return false;

        const updated = students.map(s => {
            if (s.name === oldName) {
                return { ...s, name: cleanName, initials: this.computeInitials(cleanName) };
            }
            return s;
        });
        localStorage.setItem('students', JSON.stringify(updated));

        const logs = JSON.parse(localStorage.getItem('logs'));
        logs.forEach(l => { if (l.name === oldName) l.name = cleanName; });
        localStorage.setItem('logs', JSON.stringify(logs));

        const leaves = JSON.parse(localStorage.getItem('leaves'));
        leaves.forEach(l => { if (l.name === oldName) l.name = cleanName; });
        localStorage.setItem('leaves', JSON.stringify(leaves));

        return true;
    },

    // 签到
    signIn(name) {
        const logs = JSON.parse(localStorage.getItem('logs'));
        logs.push({
            name: name,
            time: Date.now()
        });
        localStorage.setItem('logs', JSON.stringify(logs));
    },

    // 撤销签到 (只撤销本轮的最后一次)
    undoSignIn(name) {
        const logs = JSON.parse(localStorage.getItem('logs'));
        const sessionStart = parseInt(localStorage.getItem('sessionStart'));
        
        // 找到该学生在本轮的最后一条记录索引
        let index = -1;
        for (let i = logs.length - 1; i >= 0; i--) {
            if (logs[i].name === name && logs[i].time > sessionStart) {
                index = i;
                break;
            }
        }
        
        if (index > -1) {
            logs.splice(index, 1);
            localStorage.setItem('logs', JSON.stringify(logs));
        }
    },

    // 请假
    addLeave(name, start, end) {
        const leaves = JSON.parse(localStorage.getItem('leaves'));
        // 移除该学生旧的冲突请假
        const cleanLeaves = leaves.filter(l => l.name !== name);
        cleanLeaves.push({
            name,
            start, // 格式 YYYY-MM-DD
            end
        });
        localStorage.setItem('leaves', JSON.stringify(cleanLeaves));
    },

    // 销假
    removeLeave(name) {
        const leaves = JSON.parse(localStorage.getItem('leaves')).filter(l => l.name !== name);
        localStorage.setItem('leaves', JSON.stringify(leaves));
    },

    // 开启新一轮
    startNewSession() {
        localStorage.setItem('sessionStart', Date.now().toString());
    },

    ensureSessionForToday() {
        const today = new Date().toISOString().split('T')[0];
        const last = localStorage.getItem('lastResetDate');
        if (!last) {
            localStorage.setItem('lastResetDate', today);
            return;
        }
        if (last !== today) {
            this.startNewSession();
            localStorage.setItem('lastResetDate', today);
        }
    },

    computeInitials(name) {
        const tp = window.pinyin || window.TinyPinyin;
        if (tp && typeof tp.convertToPinyin === 'function') {
            try {
                const py = tp.convertToPinyin(name, '-', true);
                const parts = (py || '').split('-');
                const ini = parts.map(p => (p && /[a-z]/i.test(p[0]) ? p[0] : '')).join('').toLowerCase();
                const cleaned = ini.replace(/[^a-z]/g, '');
                if (cleaned) return cleaned;
            } catch (e) {}
        }
        const mapStart = ["啊","芭","擦","搭","蛾","发","噶","哈","机","喀","垃","妈","拿","哦","趴","期","然","撒","塌","挖","昔","压","匝"];
        const mapLetter = ["a","b","c","d","e","f","g","h","j","k","l","m","n","o","p","q","r","s","t","w","x","y","z"];
        const getInitial = (ch) => {
            if (/[a-z]/i.test(ch)) return ch.toLowerCase();
            if (/[\u4e00-\u9fa5]/.test(ch)) {
                for (let i = mapStart.length - 1; i >= 0; i--) {
                    if (ch.localeCompare(mapStart[i]) >= 0) return mapLetter[i];
                }
            }
            return '';
        };
        return Array.from(name).map(getInitial).join('');
    },

    // 获取今日状态列表
    getDailyList() {
        const students = this.getStudents();
        const logs = JSON.parse(localStorage.getItem('logs'));
        const leaves = JSON.parse(localStorage.getItem('leaves'));
        const sessionStart = parseInt(localStorage.getItem('sessionStart'));
        const today = new Date().toISOString().split('T')[0];

        const list = {
            pending: [],
            signed: [],
            leave: []
        };

        students.forEach(student => {
            // 1. 检查是否请假
            const leave = leaves.find(l => l.name === student.name);
            let isLeave = false;
            if (leave) {
                if (today >= leave.start && today <= leave.end) {
                    isLeave = true;
                    list.leave.push({ ...student, leaveRange: `${leave.start} ~ ${leave.end}` });
                }
            }

            if (!isLeave) {
                // 2. 检查本轮是否已签到
                // 查找该人员在当前sessionStart之后的签到记录
                const signRecord = logs.filter(l => l.name === student.name && l.time > sessionStart).pop();
                
                if (signRecord) {
                    list.signed.push({ 
                        ...student, 
                        signTime: new Date(signRecord.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) 
                    });
                } else {
                    const historyLogs = logs.filter(l => l.name === student.name && l.time < sessionStart);
                    let medianTime = 99999;
                    if (historyLogs.length > 0) {
                        const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
                        const recentLogs = historyLogs.filter(l => l.time > sevenDaysAgo);
                        if (recentLogs.length > 0) {
                            const mins = recentLogs.map(l => {
                                const d = new Date(l.time);
                                return d.getHours() * 60 + d.getMinutes();
                            }).sort((a, b) => a - b);
                            const idx = Math.floor((mins.length - 1) / 2);
                            medianTime = mins[idx];
                        }
                    }
                    list.pending.push({ ...student, avgTime: medianTime });
                }
            }
        });

        // 排序待签到：平均时间越小（越早）越靠前
        list.pending.sort((a, b) => a.avgTime - b.avgTime);
        
        // 排序已签到：按签到时间倒序（刚签的在最上面）
        list.signed.sort((a, b) => b.signTime.localeCompare(a.signTime));

        return list;
    }
};

// UI 控制模块
const App = {
    currentTab: 'pending',
    longPressTimer: null,
    selectedStudent: null,

    init() {
        DataManager.init();
        DataManager.ensureSessionForToday();
        this.bindEvents();
        this.render();
        this.startAutoResetWatcher();
    },

    bindEvents() {
        // 标签切换
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // 按钮事件
        document.getElementById('btn-add').onclick = () => this.showModal('modal-add');
        
        // 更多菜单
        document.getElementById('btn-more').onclick = () => this.showModal('modal-more');

        // 更多菜单里的操作
        document.getElementById('btn-export').onclick = () => {
            document.getElementById('modal-more').classList.add('hidden');
            this.showExport();
        };

        document.getElementById('btn-reset').onclick = () => {
            document.getElementById('modal-more').classList.add('hidden');
            if(confirm('确定要开启新一轮签到吗？当前已签到状态将重置。')) {
                DataManager.startNewSession();
                this.render();
            }
        };

        // 搜索功能
        const searchInput = document.getElementById('input-search');
        const clearBtn = document.getElementById('btn-clear-search');

        searchInput.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            clearBtn.classList.toggle('hidden', !val);
            this.render(); // 重新渲染触发过滤
        });

        clearBtn.onclick = () => {
            searchInput.value = '';
            clearBtn.classList.add('hidden');
            this.render();
        };

        // 模态框关闭
        document.querySelectorAll('.btn-cancel').forEach(btn => {
            btn.onclick = (e) => {
                e.target.closest('.modal').classList.add('hidden');
            };
        });

        // 新增确认
        document.getElementById('btn-confirm-add').onclick = () => {
            const input = document.getElementById('input-names').value;
            this.handleImport(input);
            document.getElementById('modal-add').classList.add('hidden');
            document.getElementById('input-names').value = ''; // 清空
            this.render();
        };

        // 导出复制
        document.getElementById('btn-copy-export').onclick = () => {
            const text = document.getElementById('output-export');
            text.select();
            document.execCommand('copy');
            alert('已复制到剪贴板');
        };

        // 菜单操作
        document.getElementById('btn-delete').onclick = () => {
            if(confirm(`确定删除 ${this.selectedStudent} 吗？`)) {
                DataManager.deleteStudent(this.selectedStudent);
                document.getElementById('modal-menu').classList.add('hidden');
                this.render();
            }
        };

        document.getElementById('btn-mark-leave').onclick = () => {
            document.getElementById('modal-menu').classList.add('hidden');
            this.showModal('modal-leave');
            // 默认选中今天和明天
            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            document.getElementById('leave-start').value = today.toISOString().split('T')[0];
            document.getElementById('leave-end').value = tomorrow.toISOString().split('T')[0];
        };

        // 修改名单
        document.getElementById('btn-rename').onclick = () => {
            document.getElementById('modal-menu').classList.add('hidden');
            const input = document.getElementById('input-rename');
            input.value = this.selectedStudent;
            this.showModal('modal-rename');
            input.focus();
        };

        document.getElementById('btn-confirm-rename').onclick = () => {
            const newName = document.getElementById('input-rename').value;
            if (DataManager.renameStudent(this.selectedStudent, newName)) {
                document.getElementById('modal-rename').classList.add('hidden');
                this.render();
            } else {
                alert('修改失败：姓名不能为空、与原名相同或已存在同名人员');
            }
        };

        // 确认请假
        document.getElementById('btn-confirm-leave').onclick = () => {
            const start = document.getElementById('leave-start').value;
            const end = document.getElementById('leave-end').value;
            if (start && end) {
                DataManager.addLeave(this.selectedStudent, start, end);
                document.getElementById('modal-leave').classList.add('hidden');
                this.render();
            }
        };
    },

    switchTab(tabName) {
        this.currentTab = tabName;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`.tab[data-tab="${tabName}"]`).classList.add('active');
        
        document.querySelectorAll('.student-list').forEach(l => l.classList.remove('active'));
        document.getElementById(`list-${tabName}`).classList.add('active');
        
        // 切换标签时重新渲染，确保搜索栏显示状态正确
        this.render();
    },

    handleImport(text) {
        // 简单解析：按逗号、顿号、换行分隔
        // 格式支持：张三, 李四(请假:2023-10-01~2023-10-02)
        const parts = text.split(/[,，\n]/).filter(s => s.trim());
        const namesToAdd = [];
        
        parts.forEach(part => {
            part = part.trim();
            if (!part) return;

            // 检查是否有请假标记 (简单正则)
            const leaveMatch = part.match(/^(.*?)[（(]请假[:：](.*?)~?(.*?)[)）]$/);
            
            if (leaveMatch) {
                const name = leaveMatch[1].trim();
                const start = leaveMatch[2].trim();
                const end = leaveMatch[3].trim() || start; // 如果没有结束时间，默认当天
                namesToAdd.push(name);
                // 延迟添加请假，确保人员先存在
                setTimeout(() => DataManager.addLeave(name, start, end), 100);
            } else {
                namesToAdd.push(part);
            }
        });

        const count = DataManager.addStudents(namesToAdd);
        if (count > 0) alert(`成功导入 ${count} 名人员`);
    },

    showExport() {
        const students = DataManager.getStudents();
        const leaves = JSON.parse(localStorage.getItem('leaves'));
        const today = new Date().toISOString().split('T')[0];

        const lines = students.map(s => {
            const leave = leaves.find(l => l.name === s.name);
            if (leave && leave.end >= today) { // 只导出未来或当前的请假
                return `${s.name}(请假:${leave.start}~${leave.end})`;
            }
            return s.name;
        });

        document.getElementById('output-export').value = lines.join(', ');
        this.showModal('modal-export');
    },

    showModal(id) {
        document.getElementById(id).classList.remove('hidden');
    },

    createCard(student, type) {
        const div = document.createElement('div');
        div.className = `card ${type}-card`;
        
        let subText = '';
        let actionIcon = '';
        
        if (type === 'pending') {
            subText = student.avgTime > 1440 ? '新名单' : `预计 ${Math.floor(student.avgTime/60)}:${(student.avgTime%60).toString().padStart(2,'0')} 签到`;
            actionIcon = '➡️';
        } else if (type === 'signed') {
            subText = `签到时间: ${student.signTime}`;
            actionIcon = '↩️';
        } else if (type === 'leave') {
            subText = `请假: ${student.leaveRange}`;
            actionIcon = '✅';
        }

        div.innerHTML = `
            <div class="card-info">
                <div class="card-name">${student.name}</div>
                <div class="card-meta">${subText}</div>
            </div>
            <div class="card-action">${actionIcon}</div>
        `;

        // 点击事件
        div.onclick = () => {
            if (type === 'pending') {
                // 待签到改为双击，单击不处理
                return;
            } else if (type === 'signed') {
                if(confirm('要撤销该人员的签到吗？')) {
                    DataManager.undoSignIn(student.name);
                }
            } else if (type === 'leave') {
                if(confirm('该人员销假归队吗？')) {
                    DataManager.removeLeave(student.name);
                }
            }
            this.render();
        };

        // 双击事件 (仅待签到)
        if (type === 'pending') {
            div.ondblclick = () => {
                DataManager.signIn(student.name);
                // 震动反馈 (如果支持)
                if (navigator.vibrate) navigator.vibrate(50);
                
                // 签到成功后，如果正在搜索，则清空搜索框
                const searchInput = document.getElementById('input-search');
                if (searchInput.value) {
                    searchInput.value = '';
                    document.getElementById('btn-clear-search').classList.add('hidden');
                }
                this.render();
            };
        }

        // 长按事件
        let pressTimer;
        div.addEventListener('touchstart', () => {
            pressTimer = setTimeout(() => {
                this.selectedStudent = student.name;
                document.getElementById('menu-student-name').innerText = student.name;
                this.showModal('modal-menu');
            }, 800);
        });
        div.addEventListener('touchend', () => clearTimeout(pressTimer));
        div.addEventListener('touchmove', () => clearTimeout(pressTimer));
        // 兼容PC鼠标长按
        div.addEventListener('mousedown', () => {
            pressTimer = setTimeout(() => {
                this.selectedStudent = student.name;
                document.getElementById('menu-student-name').innerText = student.name;
                this.showModal('modal-menu');
            }, 800);
        });
        div.addEventListener('mouseup', () => clearTimeout(pressTimer));

        return div;
    },

    render() {
        const data = DataManager.getDailyList();
        const searchTerm = document.getElementById('input-search').value.trim();
        
        // 搜索过滤 (仅过滤待签到列表)
        let pendingList = data.pending;
        if (searchTerm) {
            const isAlpha = /^[a-z]+$/i.test(searchTerm);
            if (isAlpha) {
                const q = searchTerm.toLowerCase();
                pendingList = pendingList.filter(s => DataManager.computeInitials(s.name).includes(q));
            } else {
                pendingList = pendingList.filter(s => s.name.includes(searchTerm));
            }
        }

        // 更新统计
        document.getElementById('stats-text').innerText = `待签 ${data.pending.length} 人`;

        // 渲染列表
        const renderList = (id, list, type) => {
            const container = document.getElementById(id);
            container.innerHTML = '';
            
            // 如果是待签到且有搜索词，但结果为空
            if (type === 'pending' && searchTerm && list.length === 0) {
                 container.innerHTML = `<div class="empty-state">未找到 "${searchTerm}"</div>`;
                 return;
            }

            if (list.length === 0) {
                container.innerHTML = `<div class="empty-state">暂无${type === 'pending' ? '待签' : (type === 'signed' ? '已签' : '请假')}人员</div>`;
            } else {
                list.forEach(s => container.appendChild(this.createCard(s, type)));
            }
        };

        renderList('list-pending', pendingList, 'pending');
        renderList('list-signed', data.signed, 'signed');
        renderList('list-leave', data.leave, 'leave');
        
        // 控制搜索栏显示 (仅在待签到tab显示)
        const searchContainer = document.getElementById('search-bar-container');
        if (this.currentTab === 'pending') {
            searchContainer.style.display = 'block';
        } else {
            searchContainer.style.display = 'none';
        }
    }
};

// 启动应用
window.onload = () => App.init();

App.startAutoResetWatcher = function() {
    setInterval(() => {
        DataManager.ensureSessionForToday();
    }, 60000);
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            DataManager.ensureSessionForToday();
        }
    });
    window.addEventListener('storage', (e) => {
        if (e.key === 'lastResetDate' || e.key === 'sessionStart') {
            this.render();
        }
    });
};
