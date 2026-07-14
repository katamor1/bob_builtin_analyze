const path = require("node:path")

function createPhysicalPathMatcher(fs) {
  const originalRealpath = fs.realpath.bind(fs)
  const originalLstat = fs.lstat.bind(fs)
  return async (actual, expected) => {
    const actualPath = path.resolve(String(actual))
    const expectedPath = path.resolve(String(expected))
    const actualLeaf = path.basename(actualPath)
    const expectedLeaf = path.basename(expectedPath)
    const leavesMatch = process.platform === "win32"
      ? actualLeaf.toLowerCase() === expectedLeaf.toLowerCase()
      : actualLeaf === expectedLeaf
    if (!leavesMatch) return false
    const [actualParent, expectedParent] = await Promise.all([
      originalRealpath(path.dirname(actualPath)),
      originalRealpath(path.dirname(expectedPath))
    ])
    const [actualParentStat, expectedParentStat] = await Promise.all([
      originalLstat(actualParent, { bigint: true }),
      originalLstat(expectedParent, { bigint: true })
    ])
    return actualParentStat.isDirectory()
      && expectedParentStat.isDirectory()
      && actualParentStat.dev === expectedParentStat.dev
      && actualParentStat.ino === expectedParentStat.ino
  }
}

module.exports = { createPhysicalPathMatcher }
