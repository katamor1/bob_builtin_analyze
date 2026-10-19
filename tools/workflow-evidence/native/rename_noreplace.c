#define _GNU_SOURCE
#include <errno.h>
#include <fcntl.h>
#include <stdio.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

static int basename_only(const char *name) {
  return name[0] && strcmp(name, ".") && strcmp(name, "..") &&
         !strchr(name, '/') && !strchr(name, '\\');
}

int main(int argc, char **argv) {
  struct stat parent;
  if (argc != 3 || !basename_only(argv[1]) || !basename_only(argv[2]) ||
      fstat(3, &parent) || !S_ISDIR(parent.st_mode)) return 4;
  if (renameat2(3, argv[1], 3, argv[2], RENAME_NOREPLACE) == 0) return 0;
  if (errno == EEXIST || errno == ENOTEMPTY) return 2;
  if (errno == ENOSYS || errno == EINVAL || errno == EOPNOTSUPP) return 3;
  return 4;
}
