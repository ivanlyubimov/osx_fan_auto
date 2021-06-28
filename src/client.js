import { createRequire } from 'module'
import { exec } from 'child_process'
const require = createRequire(import.meta.url)
const osxTemp = require('osx-temperature-sensor')

import { en, constants } from './utils.js'
class Client {
  constructor(config) {
    this.config = config
    this.state = { fanStatus: null, thresholdKicksReached: 0 }
    this.interval = null
  }

  async start(std) {
    const { err: gfsErr, data: fanStatus } = await en(this.getFanStatus())
    std(gfsErr, `fan ${fanStatus}`)

    const { err: stateErr } = await en(this.setState({ fanStatus }, () => {
      this.interval = setInterval(async () => {
        const { err: gctErr, data: updatedTemp } = await en(this.getCpuTemp())
        std(gctErr, `temp is ${updatedTemp}`)

        const { err: hctuErr, data: update } = await en(this.handleCpuTempUpdate(updatedTemp))
        std(hctuErr, `update ${update}`)
      }, this.config.interval * 1000)
    }))

    std(stateErr)
  }

  async getCpuTemp() {
    return new Promise((resolve) => resolve(osxTemp.cpuTemperature().main))
  }

  async getFanStatus() {
    return new Promise((resolve, reject) => {
      exec(`uhubctl | grep 'hub ${this.config.hub}' -A 7 | grep 'Port ${this.config.fanPort}'`, (err, stdout, stderr) => {
        if (err || stderr) return reject(err || stderr)
        if (stdout.includes('power')) return resolve(constants().enabled)
        return resolve(constants().disabled)
      })
    })
  }

  async handleCpuTempUpdate(tmp) {
    const { threshold, thresholdKicks } = this.config
    const { fanStatus, thresholdKicksReached } = this.state
    
    return new Promise(async (resolve, reject) => {
      const fanEnabled = fanStatus === constants().enabled
      const fanDisabled = fanStatus === constants().disabled

      const overThreshold = Number(tmp) > Number(threshold)
      const belowThreshold = Number(tmp) < Number(threshold)

      if (fanDisabled && overThreshold) {
        if (Number(thresholdKicksReached) < Number(thresholdKicks)) {
          const thresholdKicks = Number(thresholdKicksReached) + 1
          const { err } = await en(this.setState({ thresholdKicksReached: thresholdKicks }))

          if (err) return reject(err)
          return resolve(`thresholdKicksReached ${thresholdKicks}`)
        }

        const { err: fanErr, data: result } = await en(this.enableFan())
        if (fanErr) return reject(err)

        const { err: stateErr } = await en(this.setState({ fanStatus: constants().enabled, thresholdKicksReached: 0 }))
        if (stateErr) return reject(stateErr)
        return resolve(result)
      }

      if (fanEnabled && belowThreshold) {
        const { err: fanErr, data: result } = await en(this.disabelFan())
        if (fanErr) return reject(fanErr)

        const { err: stateErr } = await en(this.setState({ fanStatus: constants().disabled, thresholdKicksReached: 0 }))
        if (stateErr) return reject(stateErr)
        return resolve(result)
      }

      const { err: stateErr } = await en(this.setState({ thresholdKicksReached: 0 }))
      if (stateErr) return reject(stateErr)

      return resolve(`no switch required, fan is ${this.state.fanStatus}`)
    })
  }

  async disabelFan() {
    return new Promise((resolve, reject) => {
      exec(`uhubctl -l ${this.config.hub} -p ${this.config.fanPort} -a 0`, (err) => {
        if (err) return reject(err)
        resolve('toggling fan off')
      })
    })
  }

  async enableFan() {
    return new Promise((resolve, reject) => {
      exec(`uhubctl -l ${this.config.hub} -p ${this.config.fanPort} -a 1`, (err) => {
        if (err) return reject(err)
        resolve('toggling fan on')
      })
    })
  }

  async setState(newState, cb) {
    return new Promise(async (resolve, reject) => {
      this.state = { ...this.state, ...newState }

      if (cb) {
        const { err, data } = await en(() => cb())
        if (err) return reject(err)
        return resolve(data)
      }

      return resolve(this.state)
    })
  }
}

export default Client
