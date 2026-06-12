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
              <th>状态</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in appointments" :key="item.id">
              <td>{{ formatDateTime(item.start_time) }} - {{ formatDateTime(item.end_time) }}</td>
              <td>{{ item.student_name }}</td>
              <td>{{ item.coach_name }}</td>
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
  </section>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { CalendarCheck, XCircle, AlertCircle, AlertTriangle } from 'lucide-vue-next'
import EmptyState from '../components/EmptyState.vue'
import StatusBadge from '../components/StatusBadge.vue'
import { appointmentApi, dashboardApi } from '../api/modules'
import { addHours, formatDateTime, toLocalInputValue } from '../utils/date'

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
  appointmentId: null,
  reason: '',
  willBreach: false,
})

const activeCoaches = computed(() => props.coaches.filter((coach) => coach.active))

async function load() {
  appointments.value = await appointmentApi.list()
}

async function loadCancelRule() {
  const summary = await dashboardApi.summary()
  cancelRule.value = summary.cancel_rule
}

async function submit() {
  message.value = ''
  try {
    await appointmentApi.create({
      ...form,
      start_time: new Date(form.start_time).toISOString(),
      end_time: new Date(form.end_time).toISOString(),
    })
    message.value = '预约已创建'
    await load()
    emit('changed')
  } catch (error) {
    message.value = error.message
  }
}

function openCancelModal(appointment) {
  const hoursBeforeStart = (new Date(appointment.start_time) - new Date()) / (1000 * 60 * 60)
  const minHours = cancelRule.value?.min_hours_before_start ?? 2
  cancelModal.visible = true
  cancelModal.appointmentId = appointment.id
  cancelModal.reason = ''
  cancelModal.willBreach = hoursBeforeStart < minHours
}

function closeCancelModal() {
  cancelModal.visible = false
  cancelModal.appointmentId = null
  cancelModal.reason = ''
  cancelModal.willBreach = false
}

async function confirmCancel() {
  message.value = ''
  try {
    const result = await appointmentApi.cancel(
      cancelModal.appointmentId,
      cancelModal.reason.trim()
    )
    if (result.is_breach) {
      message.value = '预约已取消（临近开课取消，记为违约）'
    } else {
      message.value = '预约已取消'
    }
    closeCancelModal()
    await load()
    emit('changed')
  } catch (error) {
    message.value = error.message
  }
}

onMounted(() => {
  load()
  loadCancelRule()
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
  max-width: 440px;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
}

.modal h3 {
  margin: 0 0 16px 0;
  font-size: 18px;
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
</style>
