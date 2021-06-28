import axios from 'axios'
import config from '../config.js'

export async function en(x) {
  if (isPrimitive(x)) return { err: 'passed primitive to en function' }

  // regular promise
  if (x.then) {
    return x.then(data => {
      if (data instanceof Error) return { data: null, err: data }
      return { data, err: null }
    }).catch(err => ({ err }))
  }

  // async function
  if (x[Symbol.toStringTag] === 'AsyncFunction') {
    try {
      return { data: (await x() || null) }
    } catch(e) {
      return { err: e }
    }
  }

  // regular func
  if (typeof x === 'function') {
    return new Promise((resolve) => {
      try { 
        return resolve({ data: x() || null  })
      } catch (e) {
        return resolve({ err: e })
      }
    })
  }

  return { err: 'en function handler err' }
}

export async function networkMessage(text) {
  await axios.get(`${formatted(text)}`)
  function formatted(msg) { 
    return `https://api.telegram.org/bot${config.telegram.token}/sendMessage?chat_id=${config.telegram.chatId}&text=${msg}`
  }
}

export async function errReport(someErr) {
  const e = encodeURIComponent(`
    New error at ${config.deviceName}, running ${config.moduleName}:
    ${someErr.stack}
  `)
  console.error(someErr)

  if (!this.errors) this.errors = []
  if (this.errors.includes(e)) return
  this.errors.push(e)

  const { messageErr } = await en(networkMessage(e))
  if (messageErr) console.error(messageErr)
}

export function log(data) {
  console.log(data)
}

export function isPrimitive(test) {
  return test !== Object(test)
}

export function constants() {
  return {
    enabled: 'enabled',
    disabled: 'disabled'
  }
}