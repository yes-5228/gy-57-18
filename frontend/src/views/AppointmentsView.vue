<template>
  <section class="view">
    <header class="view-header">
      <div>
        <p class="eyebrow">Booking</p>
        <h2>练车预约</h2>
      </div>
    </header>

    <div class="split">
      <form class="panel form" @submit.prevent="submit">
        <h3>新建预约</h3>
        <label>
          学员
          <select v-model.number="form.student_id" required>
            <option value="" disabled>选择学员</option>
            <option v-for="student in students" :key="student.id" :value="student.id">
              {{ student.name }}（剩余 {{ student.remaining_hours }}h）
            </option>
          </select>
        </label>
        <label>
          教练
          <select v-model.number="form.coach_id" required>
            <option value="" disabled>选择教练</option>
            <option v-for="coach in activeCoaches" :key="coach.id" :value="coach.id">
              {{ coach.name }} - {{ coach.car_no }}
            </option>
          </select>
        </label>
        <label>
          开始时间
          <input v-model="form.start_time" type="datetime-local" required />
        </label>
        <label>
          结束时间
          <input v-model="form.end_time" type="datetime-local" required />
        </label>
        <button class="primary" type="submit">
          <CalendarCheck :size="18" />
          提交预约
        </button>
        <p v-if="message" class="message">{{ message }}</p>

        <div class="rule-notice">
          <AlertCircle :size="18" />
          <div>
            <p class="rule-title">违约规则</p>
            <p class="rule-desc">
              开课前 {{ cancelRule?.min_hours_before_start ?? '-' }} 小时内取消将被记为违约，会计入学员档案。
            </p>
          </div>
        </div>
      </form>

      <section class="panel list-panel">
        <h3>预约列表</h3>
        <EmptyState v-if="appointments.length === 0" />
        <table v-else>
          <thead>
            <tr>
              <th>时间</th>
              <th>学员</th>
              <th>教练</th>
              <th>距开课</th>
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in appointments" :key="item.id">
              <td>{{ formatDateTime(item.start_time) }} - {{ formatDateTime(item.end_time) }}</td>
              <td>{{ item.student_name }}</td>
              <td>{{ item.coach_name }}</td>
              <td>
                <span
                  v-if="item.status === 'booked'"
                  :class="['countdown', { 'breach-soon': isNearBreach(item.start_time) }]"
                >
                  <Clock :size="14" />
                  {{ getCountdown(item.start_time).text }}
                </span>
                <span v-else>—</span>
              </td>
              <td><StatusBadge :status="item.status" :is-breach="item.is_breach" /></td>
              <td>
                <button
                  class="ghost danger"
                  :disabled="item.status !== 'booked'"
                  @click="openCancelModal(item)"
                >
                  <XCircle :size="16" />
                  取消
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>

    <div v-if="cancelModal.visible" class="modal-overlay" @click.self="closeCancelModal">
      <div class="modal">
        <h3>取消预约</h3>
        <div class="appointment-info">
          <div class="info-row">
            <span class="info-label">学员</span>
            <span class="info-value">{{ cancelModal.appointment?.student_name }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">教练</span>
            <span class="info-value">{{ cancelModal.appointment?.coach_name }}</span>
          </div>
          <div class="info-row">
            <span class="info-label">时间</span>
            <span class="info-value">
              {{ cancelModal.appointment ? formatDateTime(cancelModal.appointment.start_time) : '' }}
              -
              {{ cancelModal.appointment ? formatDateTime(cancelModal.appointment.end_time) : '' }}
            </span>
          </div>
          <div class="info-row highlight">
            <span class="info-label">距开课</span>
            <span
              class="info-value"
              :class="{ 'breach-soon-text': cancelModal.willBreach }"
            >
              <Clock :size="14" />
              {{ cancelModal.countdownText }}
            </span>
          </div>
        </div>

        <div v-if="cancelModal.willBreach" class="breach-warning">
          <AlertTriangle :size="20" />
          <div>
            <p class="warning-title">即将产生违约记录</p>
            <p class="warning-desc">
              该预约距离开课不足 {{ cancelRule?.min_hours_before_start }} 小时，
              取消将被记为违约，会计入学员档案。
            </p>
          </div>
        </div>
        <label>
          取消原因
          <textarea
            v-model="cancelModal.reason"
            rows="3"
            placeholder="请输入取消原因"
            required
          ></textarea>
        </label>
        <div class="modal-actions">
          <button class="ghost" @click="closeCancelModal">返回</button>
          <button
            class="danger"
            :disabled="!cancelModal.reason.trim()"
            @click="confirmCancel"
          >
            确认取消
          </button>
        </div>
      </div>
    </div>

    <transition name="toast">
      <div v-if="toast.visible" :class="['toast', toast.type]">
        <component :is="toast.icon" :size="20" />
        <div class="toast-content">
          <p class="toast-title">{{ toast.title }}</p>
          <p v-if="toast.desc" class="toast-desc">{{ toast.desc }}</p>
        </div>
      </div>
    </transition>
  </section>
</template>

<script setup>
import { computed, markRaw, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { CalendarCheck, XCircle, AlertCircle, AlertTriangle, Clock, CheckCircle2, XCircle as XIcon } from 'lucide-vue-next'
import EmptyState from '../components/EmptyState.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { appointmentApi, dashboardApi } from '../api/modules'
import { addHours, formatCountdown, formatDateTime, toLocalInputValue } from '../utils/date'

const props = defineProps({
  students: {
    type: Array,
    default: () => [],
  },
  coaches: {
    type: Array,
    default: () => [],
  },
  refreshToken: {
    type: Number,
    default: 0,
  },
})

const emit = defineEmits(['changed'])

const appointments = ref([])
const cancelRule = ref(null)
const message = ref('')
const initialStart = addHours(new Date(), 24)
const form = reactive({
  student_id: '',
  coach_id: '',
  start_time: toLocalInputValue(initialStart),
  end_time: toLocalInputValue(addHours(initialStart, 2)),
})

const cancelModal = reactive({
  visible: false,
  appointment: null,
  appointmentId: null,
  reason: '',
  willBreach: false,
  countdownText: '',
})

const toast = reactive({
  visible: false,
  type: 'success',
  title: '',
  desc: '',
  icon: markRaw(CheckCircle2),
})

let toastTimer = null
let countdownTimer = null

const activeCoaches = computed(() => props.coaches.filter((coach) => coach.active))

function getCountdown(startTime) {
  return formatCountdown(startTime)
}

function isNearBreach(startTime) {
  const countdown = formatCountdown(startTime)
  const minHours = cancelRule.value?.min_hours_before_start ?? 2
  return !countdown.isPast && countdown.totalHours < minHours
}

function showToast(options) {
  if (toastTimer) {
    clearTimeout(toastTimer)
  }
  toast.visible = true
  toast.type = options.type || 'success'
  toast.title = options.title || ''
  toast.desc = options.desc || ''
  toast.icon = markRaw(options.type === 'success' ? CheckCircle2 : XIcon)

  toastTimer = setTimeout(() => {
    toast.visible = false
  }, 4000)
}

async function load() {
  appointments.value = await appointmentApi.list()
}

async function loadCancelRule() {
  const summary = await dashboardApi.summary()
  cancelRule.value = summary.cancel_rule
}

function refreshCountdowns() {
  if (cancelModal.visible && cancelModal.appointment) {
    const cd = formatCountdown(cancelModal.appointment.start_time)
    cancelModal.countdownText = cd.isPast ? '已开课' : cd.text
  }
}

async function submit() {
  message.value = ''
  try {
    await appointmentApi.create({
      ...form,
      start_time: new Date(form.start_time).toISOString(),
      end_time: new Date(form.end_time).toISOString(),
    })
    showToast({
      type: 'success',
      title: '预约创建成功',
      desc: `${form.student_id ? students.find(s => s.id === form.student_id)?.name : ''} 的课程已预约`,
    })
    form.student_id = ''
    form.coach_id = ''
    const now = addHours(new Date(), 24)
    form.start_time = toLocalInputValue(now)
    form.end_time = toLocalInputValue(addHours(now, 2))
    await load()
    emit('changed')
  } catch (error) {
    showToast({
      type: 'error',
      title: '预约创建失败',
      desc: error.message,
    })
  }
}

function openCancelModal(appointment) {
  const countdown = formatCountdown(appointment.start_time)
  const minHours = cancelRule.value?.min_hours_before_start ?? 2
  cancelModal.visible = true
  cancelModal.appointment = appointment
  cancelModal.appointmentId = appointment.id
  cancelModal.reason = ''
  cancelModal.willBreach = !countdown.isPast && countdown.totalHours < minHours
  cancelModal.countdownText = countdown.isPast ? '已开课' : countdown.text
}

function closeCancelModal() {
  cancelModal.visible = false
  cancelModal.appointment = null
  cancelModal.appointmentId = null
  cancelModal.reason = ''
  cancelModal.willBreach = false
  cancelModal.countdownText = ''
}

async function confirmCancel() {
  message.value = ''
  try {
    const result = await appointmentApi.cancel(
      cancelModal.appointmentId,
      cancelModal.reason.trim()
    )
    closeCancelModal()
    await load()
    emit('changed')

    if (result.is_breach) {
      showToast({
        type: 'error',
        title: '预约已取消（违约）',
        desc: `${result.student_name} 的违约记录已更新，违约次数 +1`,
      })
    } else {
      showToast({
        type: 'success',
        title: '预约已取消',
        desc: `${result.student_name} 的课程已成功取消`,
      })
    }
  } catch (error) {
    showToast({
      type: 'error',
      title: '取消失败',
      desc: error.message,
    })
  }
}

onMounted(() => {
  load()
  loadCancelRule()
  countdownTimer = setInterval(refreshCountdowns, 30000)
})

onBeforeUnmount(() => {
  if (toastTimer) clearTimeout(toastTimer)
  if (countdownTimer) clearInterval(countdownTimer)
})

watch(() => props.refreshToken, load)
</script>

<style scoped>
.rule-notice {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  background: #fef3c7;
  border-radius: 8px;
  margin-top: 16px;
  color: #92400e;
}

.rule-notice svg {
  flex-shrink: 0;
  margin-top: 2px;
}

.rule-title {
  font-weight: 600;
  margin: 0 0 4px 0;
}

.rule-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}

.countdown {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  padding: 4px 10px;
  background: #f3f4f6;
  border-radius: 999px;
  color: #4b5563;
}

.countdown.breach-soon {
  background: #fee2e2;
  color: #dc2626;
  font-weight: 600;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.75; }
}

.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: 12px;
  padding: 24px;
  width: 90%;
  max-width: 480px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
}

.modal h3 {
  margin: 0 0 16px 0;
  font-size: 18px;
}

.appointment-info {
  background: #f9fafb;
  border-radius: 8px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

.info-row {
  display: flex;
  align-items: center;
  padding: 4px 0;
  font-size: 14px;
}

.info-row.highlight {
  padding-top: 8px;
  margin-top: 4px;
  border-top: 1px solid #e5e7eb;
}

.info-label {
  width: 60px;
  color: #6b7280;
  flex-shrink: 0;
}

.info-value {
  color: #111827;
  font-weight: 500;
}

.info-value.breach-soon-text {
  color: #dc2626;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.breach-warning {
  display: flex;
  gap: 12px;
  padding: 12px 16px;
  background: #fee2e2;
  border-radius: 8px;
  margin-bottom: 16px;
  color: #991b1b;
}

.breach-warning svg {
  flex-shrink: 0;
  margin-top: 2px;
}

.warning-title {
  font-weight: 600;
  margin: 0 0 4px 0;
}

.warning-desc {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}

.modal label {
  display: block;
  margin-bottom: 16px;
}

.modal textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
  margin-top: 6px;
  box-sizing: border-box;
}

.modal textarea:focus {
  outline: none;
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.modal-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}

.toast {
  position: fixed;
  top: 24px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 20px;
  border-radius: 10px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.15);
  z-index: 2000;
  min-width: 320px;
  max-width: 90vw;
}

.toast.success {
  background: #ecfdf5;
  border: 1px solid #6ee7b7;
  color: #065f46;
}

.toast.error {
  background: #fef2f2;
  border: 1px solid #fca5a5;
  color: #991b1b;
}

.toast svg {
  flex-shrink: 0;
  margin-top: 2px;
}

.toast.success svg { color: #059669; }
.toast.error svg { color: #dc2626; }

.toast-content {
  flex: 1;
}

.toast-title {
  margin: 0;
  font-weight: 600;
  font-size: 15px;
}

.toast-desc {
  margin: 4px 0 0 0;
  font-size: 13px;
  opacity: 0.85;
  line-height: 1.4;
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}

.toast-enter-from {
  opacity: 0;
  transform: translate(-50%, -20px);
}

.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -20px);
}
</style>
