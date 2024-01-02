function getDeviceId(request, next) {
  console.log(request.headers);
  if (
    !request.headers ||
    !request.headers.device_id ||
    typeof request.headers.device_id !== "string"
  ) {
    return next({
      headers:
        [
          "HTTP/1.1 401 Unauthorized",
          `Reason: Invalid device_id or device_id not present in headers`,
        ].join("\n") + "\n\n",
    });
  }

  return next(null, request.headers.device_id);
}

module.exports = getDeviceId;
