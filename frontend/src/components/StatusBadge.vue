<template>
  <span class="badge" :class="[status, { breach: isBreach }]">
    {{ isBreach ? '已取消（违约）' : labels[status] || status }}
  </span>
</template>

<script setup>
defineProps({
  status: {
    type: String,
    required: true,
  },
  isBreach: {
    type: Boolean,
    default: false,
  },
})

const labels = {
  booked: '已预约',
  cancelled: '已取消',
  completed: '已完成',
}
</script>

<style scoped>
.badge.breach {
  background-color: #fee2e2;
  color: #dc2626;
}
</style>
