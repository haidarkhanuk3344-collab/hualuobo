#import <Cocoa/Cocoa.h>
#import <ApplicationServices/ApplicationServices.h>
#include <node_api.h>
#include <functional>
#include <string>
#include <vector>

// Runs inside the already-authorized Electron process, on a worker thread.
// Read-only: no AXPerformAction, mouse synthesis, file changes or app launching.
static id attr(AXUIElementRef element, CFStringRef name) {
    CFTypeRef value = nullptr;
    if (AXUIElementCopyAttributeValue(element, name, &value) != kAXErrorSuccess) return nil;
    return CFBridgingRelease(value);
}
static NSString *textAttr(AXUIElementRef e, CFStringRef name) {
    id value = attr(e, name);
    return [value isKindOfClass:NSString.class] ? value : @"";
}
static bool rectAttr(AXUIElementRef e, CGRect &r) {
    id p = attr(e, kAXPositionAttribute), s = attr(e, kAXSizeAttribute);
    if (!p || !s || CFGetTypeID((__bridge CFTypeRef)p) != AXValueGetTypeID() || CFGetTypeID((__bridge CFTypeRef)s) != AXValueGetTypeID()) return false;
    CGPoint point; CGSize size;
    if (!AXValueGetValue((__bridge AXValueRef)p, (AXValueType)kAXValueCGPointType, &point) || !AXValueGetValue((__bridge AXValueRef)s, (AXValueType)kAXValueCGSizeType, &size)) return false;
    if (size.width < 16 || size.height < 16 || size.width >= 240 || size.height >= 200) return false;
    r = CGRectMake(point.x, point.y, size.width, size.height); return true;
}
static NSDictionary *discover() {
    bool trusted = AXIsProcessTrusted();
    NSMutableArray *targets = [NSMutableArray array];
    if (trusted) {
        NSArray *windows = CFBridgingRelease(CGWindowListCopyWindowInfo(kCGWindowListOptionOnScreenOnly | kCGWindowListExcludeDesktopElements, kCGNullWindowID));
        std::vector<CGRect> covers;
        for (NSDictionary *entry in windows) {
            CGRect r; NSDictionary *bounds = entry[(NSString *)kCGWindowBounds];
            if ([entry[(NSString *)kCGWindowLayer] intValue] == 0 && [entry[(NSString *)kCGWindowAlpha] doubleValue] > 0 && bounds && CGRectMakeWithDictionaryRepresentation((__bridge CFDictionaryRef)bounds, &r) && r.size.width > 40 && r.size.height > 40) covers.push_back(r);
        }
        int visited = 0; double started = CFAbsoluteTimeGetCurrent();
        std::function<void(AXUIElementRef, NSString *, int)> walk;
        walk = [&](AXUIElementRef node, NSString *kind, int depth) {
            if (++visited >= 1600 || depth >= 10 || CFAbsoluteTimeGetCurrent() - started > 1.2) return;
            NSString *role = textAttr(node, kAXRoleAttribute), *subrole = textAttr(node, kAXSubroleAttribute);
            NSString *title = textAttr(node, kAXTitleAttribute), *description = textAttr(node, kAXDescriptionAttribute);
            bool desktop = [kind isEqualToString:@"desktop"];
            bool candidate = desktop ? ([role isEqualToString:@"AXImage"] || [role isEqualToString:@"AXButton"]) : [subrole isEqualToString:@"AXApplicationDockItem"];
            CGRect r;
            if (candidate && rectAttr(node, r)) {
                CGPoint center = CGPointMake(CGRectGetMidX(r), CGRectGetMidY(r));
                bool covered = false; if (desktop) for (CGRect cover : covers) if (CGRectContainsPoint(cover, center)) { covered = true; break; }
                if (!(desktop && (r.size.width < 28 || r.size.height < 28 || center.y < 30 || covered))) {
                    NSString *name = title.length ? title : description;
                    [targets addObject:@{@"id":[NSString stringWithFormat:@"%@:%@",kind,name], @"kind":kind, @"name":name, @"bounds":@{@"x":@(r.origin.x),@"y":@(r.origin.y),@"width":@(r.size.width),@"height":@(r.size.height)}}];
                }
            }
            id children = attr(node, kAXChildrenAttribute);
            if ([children isKindOfClass:NSArray.class]) for (id child in children) walk((__bridge AXUIElementRef)child, kind, depth + 1);
        };
        for (NSArray *pair in @[@[@"com.apple.dock",@"dock"],@[@"com.apple.finder",@"desktop"]]) {
            NSRunningApplication *application = [NSRunningApplication runningApplicationsWithBundleIdentifier:pair[0]].firstObject;
            if (!application) continue;
            AXUIElementRef root = AXUIElementCreateApplication(application.processIdentifier);
            AXUIElementSetMessagingTimeout(root, .15); walk(root, pair[1], 0); CFRelease(root);
        }
    }
    return @{@"status":trusted ? @"ready" : @"permission-required",@"targets":targets,@"readOnly":@YES};
}
struct Work { napi_async_work work; napi_deferred deferred; std::string json; };
static void execute(napi_env, void *data) {
    Work *w = static_cast<Work *>(data);
    @autoreleasepool {
        @try { NSData *bytes = [NSJSONSerialization dataWithJSONObject:discover() options:0 error:nil]; w->json.assign((const char *)bytes.bytes, bytes.length); }
        @catch (NSException *) { w->json = "{\"status\":\"unavailable\",\"targets\":[]}"; }
    }
}
static void complete(napi_env env, napi_status status, void *data) {
    Work *w = static_cast<Work *>(data); napi_value value;
    if (status != napi_ok) w->json = "{\"status\":\"unavailable\",\"targets\":[]}";
    napi_create_string_utf8(env,w->json.c_str(),w->json.size(),&value); napi_resolve_deferred(env,w->deferred,value);
    napi_delete_async_work(env,w->work); delete w;
}
static napi_value getTargets(napi_env env, napi_callback_info) {
    auto *w = new Work(); napi_value promise, name;
    napi_create_promise(env,&w->deferred,&promise); napi_create_string_utf8(env,"readDesktopTargets",NAPI_AUTO_LENGTH,&name);
    napi_create_async_work(env,nullptr,name,execute,complete,w,&w->work); napi_queue_async_work(env,w->work); return promise;
}
static napi_value init(napi_env env, napi_value exports) {
    napi_value fn; napi_create_function(env,"getTargets",NAPI_AUTO_LENGTH,getTargets,nullptr,&fn); napi_set_named_property(env,exports,"getTargets",fn); return exports;
}
NAPI_MODULE(desktop_targets, init)
