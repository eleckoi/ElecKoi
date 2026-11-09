/** Windows treats objects without a mandatory integrity SID as Medium.
 * https://learn.microsoft.com/en-us/windows/win32/secauthz/mandatory-integrity-control
 * Input is the SDDL returned by the Windows security descriptor API.
 */
export function isMediumIntegrity(sddl) {
  return [...sddl.matchAll(/\(ML;[^)]*\)/g)].every(([entry]) => {
    const fields = entry.slice(1, -1).split(';')
    return fields.length === 6 && ['ME', 'S-1-16-8192'].includes(fields[5])
  })
}
