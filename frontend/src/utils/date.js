export function toLocalInputValue(date) {
  const value = date instanceof Date ? date : new Date(date)
  const offset = value.getTimezoneOffset()
  const local = new Date(value.getTime() - offset * 60 * 1000)
  return local.toISOString().slice(0, 16)
}

export function formatDateTime(value) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000)
}

export function formatCountdown(targetTime) {
  const target = new Date(targetTime)
  const diff = target.getTime() - Date.now()
  if (diff <= 0) {
    return { text: '已开课', hours: 0, totalHours: 0, isPast: true, isNearBreach: false }
  }
  const totalMinutes = Math.floor(diff / (1000 * 60))
  const days = Math.floor(totalMinutes / (60 * 24))
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60)
  const minutes = totalMinutes % 60
  const totalHours = diff / (1000 * 60 * 60)

  let text = ''
  if (days > 0) {
    text = `${days}天${hours}小时${minutes}分钟`
  } else if (hours > 0) {
    text = `${hours}小时${minutes}分钟`
  } else {
    text = `${minutes}分钟`
  }

  return {
    text,
    hours: totalHours,
    totalHours,
    isPast: false,
    isNearBreach: false,
  }
}
