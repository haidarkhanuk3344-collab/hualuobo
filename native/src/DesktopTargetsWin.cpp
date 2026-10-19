// Read-only Explorer desktop geometry. No UIA patterns, focus, clicks, or file-content access.
// UIA rectangles are physical pixels; Electron converts them to DIPs.
// Microsoft primary references:
// https://learn.microsoft.com/windows/win32/winauto/uiauto-screenscaling
// https://learn.microsoft.com/windows/win32/winauto/uiauto-threading
// https://learn.microsoft.com/windows/win32/api/uiautomationclient/nf-uiautomationclient-iuiautomationelement-findallbuildcache
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <dwmapi.h>
#include <uiautomation.h>
#include <oleauto.h>
#include <shlobj.h>
#include <shlwapi.h>
#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <cwchar>
#include <memory>
#include <set>
#include <sstream>
#include <string>
#include <vector>

template<class T> struct Com {
    T* value=nullptr;
    ~Com(){if(value)value->Release();}
    T* operator->() const{return value;}
    T** out(){if(value)value->Release();value=nullptr;return &value;}
    explicit operator bool()const{return value!=nullptr;}
    Com()=default;Com(const Com&)=delete;Com& operator=(const Com&)=delete;
};
struct Icon {std::string id,name;RECT bounds;};
static DWORD ignoredPid=0;
static std::wstring className(HWND h){wchar_t name[256]={};GetClassNameW(h,name,256);return name;}
static std::string utf8(const std::wstring& s){
    if(s.empty())return {};
    int n=WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,s.data(),static_cast<int>(s.size()),nullptr,0,nullptr,nullptr);
    if(!n)return {};std::string result(n,'\0');
    WideCharToMultiByte(CP_UTF8,WC_ERR_INVALID_CHARS,s.data(),static_cast<int>(s.size()),result.data(),n,nullptr,nullptr);return result;
}
static std::string quote(const std::string& s){
    std::string out="\"";const char hex[]="0123456789abcdef";
    for(unsigned char c:s){if(c=='"'||c=='\\'){out+='\\';out+=static_cast<char>(c);}else if(c<32){out+="\\u00";out+=hex[c>>4];out+=hex[c&15];}else out+=static_cast<char>(c);}return out+'"';
}
static void emit(const char* status,const std::vector<Icon>& icons={},const char* reason=nullptr){
    std::ostringstream out;out<<"{\"status\":"<<quote(status)<<",\"coordinateSpace\":\"physical\",\"readOnly\":true,\"targets\":[";
    for(size_t i=0;i<icons.size();i++){const auto& o=icons[i];const auto& b=o.bounds;if(i)out<<',';
        out<<"{\"id\":"<<quote(o.id)<<",\"kind\":\"desktop\",\"name\":"<<quote(o.name)<<",\"bounds\":{\"x\":"<<b.left<<",\"y\":"<<b.top<<",\"width\":"<<b.right-b.left<<",\"height\":"<<b.bottom-b.top<<"}}";}
    out<<']';if(reason)out<<",\"reason\":"<<quote(reason);out<<"}\n";
    const auto line=out.str();if(fwrite(line.data(),1,line.size(),stdout)!=line.size()||fflush(stdout)!=0)ExitProcess(0);
}
static bool cloaked(HWND h){DWORD v=0;return SUCCEEDED(DwmGetWindowAttribute(h,DWMWA_CLOAKED,&v,sizeof(v)))&&v!=0;}
struct DesktopSearch {DWORD shellPid;std::vector<HWND> lists;};
static BOOL CALLBACK findDesktop(HWND top,LPARAM param){
    auto& search=*reinterpret_cast<DesktopSearch*>(param);const auto cls=className(top);
    if(cls!=L"Progman"&&cls!=L"WorkerW")return TRUE;
    DWORD pid=0;GetWindowThreadProcessId(top,&pid);if(pid!=search.shellPid)return TRUE;
    HWND view=FindWindowExW(top,nullptr,L"SHELLDLL_DefView",nullptr);
    if(view){HWND list=FindWindowExW(view,nullptr,L"SysListView32",nullptr);if(list)search.lists.push_back(list);}return TRUE;
}
static std::vector<RECT> coversAbove(HWND desktop){
    std::vector<RECT> covers;int limit=0;
    // Top-to-bottom Z order, stop at this desktop instead of counting windows behind it.
    for(HWND h=GetTopWindow(nullptr);h&&h!=desktop&&limit++<2048;h=GetWindow(h,GW_HWNDNEXT)){
        if(!IsWindowVisible(h)||IsIconic(h)||cloaked(h))continue;
        DWORD pid=0;GetWindowThreadProcessId(h,&pid);if(pid==ignoredPid||pid==GetCurrentProcessId())continue;
        auto cls=className(h);if(cls==L"Progman"||cls==L"WorkerW"||cls==L"Shell_TrayWnd"||cls==L"Shell_SecondaryTrayWnd")continue;
        LONG_PTR ex=GetWindowLongPtrW(h,GWL_EXSTYLE);
        if(ex&WS_EX_LAYERED){BYTE alpha=255;DWORD flags=0;COLORREF color=0;
            if(GetLayeredWindowAttributes(h,&color,&alpha,&flags)&&(flags&LWA_ALPHA)&&alpha==0)continue;}
        RECT r={};if(FAILED(DwmGetWindowAttribute(h,DWMWA_EXTENDED_FRAME_BOUNDS,&r,sizeof(r)))&&!GetWindowRect(h,&r))continue;
        if(r.right-r.left>20&&r.bottom-r.top>20)covers.push_back(r);
    }return covers;
}
static bool isCovered(const RECT& icon,const std::vector<RECT>& covers){RECT intersection;
    for(const RECT& r:covers)if(IntersectRect(&intersection,&icon,&r))return true;return false;}
static bool desktopFileNames(std::set<std::wstring>& names){
    // Shell metadata only. Do not resolve shortcuts or read file contents.
    // This excludes virtual desktop items such as Recycle Bin and This PC.
    Com<IShellFolder> folder;if(FAILED(SHGetDesktopFolder(folder.out())))return false;
    Com<IEnumIDList> entries;
    HRESULT hr=folder->EnumObjects(nullptr,SHCONTF_FOLDERS|SHCONTF_NONFOLDERS|SHCONTF_INCLUDEHIDDEN,entries.out());
    if(hr==S_FALSE)return true;if(FAILED(hr)||!entries)return false;
    int count=0;
    for(;;){PITEMID_CHILD pidl=nullptr;ULONG fetched=0;hr=entries->Next(1,&pidl,&fetched);
        if(hr==S_FALSE)break;if(FAILED(hr)||fetched!=1||!pidl)return false;
        SFGAOF attributes=SFGAO_FILESYSTEM|SFGAO_LINK;
        PCUITEMID_CHILD one=pidl;
        if(SUCCEEDED(folder->GetAttributesOf(1,&one,&attributes))&&(attributes&(SFGAO_FILESYSTEM|SFGAO_LINK))){
            STRRET value={};PWSTR name=nullptr;
            if(SUCCEEDED(folder->GetDisplayNameOf(pidl,SHGDN_NORMAL,&value))&&SUCCEEDED(StrRetToStrW(&value,pidl,&name))&&name){names.insert(name);CoTaskMemFree(name);}
        }
        CoTaskMemFree(pidl);if(++count>4096)return false;
    }return true;
}
static std::string runtimeId(IUIAutomationElement* item){
    VARIANT v;VariantInit(&v);std::string id;
    if(SUCCEEDED(item->GetCachedPropertyValue(UIA_RuntimeIdPropertyId,&v))&&v.vt==(VT_ARRAY|VT_I4)&&v.parray&&SafeArrayGetDim(v.parray)==1){
        LONG first=0,last=-1;SafeArrayGetLBound(v.parray,1,&first);SafeArrayGetUBound(v.parray,1,&last);
        if(last-first>=0&&last-first<64){for(LONG i=first;i<=last;i++){LONG n=0;if(SUCCEEDED(SafeArrayGetElement(v.parray,&i,&n))){if(!id.empty())id+='.';id+=std::to_string(n);}}}
    }VariantClear(&v);return id;
}
static bool scan(IUIAutomation* uia,std::vector<Icon>& icons){
    HWND shell=GetShellWindow();if(!shell)return false;
    DWORD shellPid=0;GetWindowThreadProcessId(shell,&shellPid);if(!shellPid)return false;
    DesktopSearch search{shellPid,{}};EnumWindows(findDesktop,reinterpret_cast<LPARAM>(&search));
    if(search.lists.empty())return false;
    bool anyVisible=false;for(HWND list:search.lists)if(IsWindowVisible(list)&&!cloaked(GetAncestor(list,GA_ROOT)))anyVisible=true;
    if(!anyVisible)return true;
    std::set<std::wstring> allowedNames;
    if(!desktopFileNames(allowedNames))return false;
    Com<IUIAutomationCondition> condition;VARIANT type;VariantInit(&type);type.vt=VT_I4;type.lVal=UIA_ListItemControlTypeId;
    if(FAILED(uia->CreatePropertyCondition(UIA_ControlTypePropertyId,type,condition.out())))return false;
    Com<IUIAutomationCacheRequest> cache;
    if(FAILED(uia->CreateCacheRequest(cache.out())))return false;
    cache->put_TreeScope(TreeScope_Element);
    for(PROPERTYID p:{UIA_NamePropertyId,UIA_BoundingRectanglePropertyId,UIA_IsOffscreenPropertyId,UIA_RuntimeIdPropertyId})if(FAILED(cache->AddProperty(p)))return false;
    cache->put_AutomationElementMode(AutomationElementMode_None);
    std::set<std::string> seen;
    for(HWND list:search.lists){
        // Explorer's "Show desktop icons" hides the ListView. Never use stale UIA data.
        if(!IsWindow(list)||!IsWindowVisible(list)||cloaked(GetAncestor(list,GA_ROOT)))continue;
        Com<IUIAutomationElement> root;if(FAILED(uia->ElementFromHandle(list,root.out())))return false;
        Com<IUIAutomationElementArray> items;
        if(FAILED(root->FindAllBuildCache(TreeScope_Children,condition.value,cache.value,items.out()))||!items)return false;
        int count=0;if(FAILED(items->get_Length(&count)))return false;
        if(count>2048)return false;
        auto covers=coversAbove(GetAncestor(list,GA_ROOT));
        for(int i=0;i<count;i++){
            Com<IUIAutomationElement> item;if(FAILED(items->GetElement(i,item.out())))return false;
            BOOL offscreen=TRUE;RECT r={};BSTR raw=nullptr;
            if(FAILED(item->get_CachedIsOffscreen(&offscreen))||offscreen||FAILED(item->get_CachedBoundingRectangle(&r)))continue;
            LONG width=r.right-r.left,height=r.bottom-r.top;
            if(width<16||height<16||width>1024||height>1024||isCovered(r,covers))continue;
            if(FAILED(item->get_CachedName(&raw))||!raw)continue;
            std::wstring wide(raw,SysStringLen(raw));SysFreeString(raw);if(wide.empty()||wide.size()>1024||!allowedNames.count(wide))continue;
            auto name=utf8(wide);if(name.empty())continue;
            auto rid=runtimeId(item.value);
            // Runtime ID remains stable while the user moves/rearranges this icon.
            // Name fallback is unique within this desktop; duplicates get an explicit suffix.
            std::string id="desktop:"+std::to_string(shellPid)+":"+(rid.empty()?name:rid);
            if(seen.count(id))id+=':'+std::to_string(i);seen.insert(id);
            icons.push_back({id,name,r});
        }
        // Explorer can disappear or hide the desktop during an in-flight UIA read.
        if(!IsWindow(list)||!IsWindowVisible(list)){icons.clear();return false;}
    }return true;
}
static DWORD WINAPI watchParent(LPVOID handle){WaitForSingleObject(static_cast<HANDLE>(handle),INFINITE);ExitProcess(0);}
int wmain(int argc,wchar_t** argv){
    SetErrorMode(SEM_FAILCRITICALERRORS|SEM_NOGPFAULTERRORBOX);
    DWORD parentPid=0;
    for(int i=1;i<argc;i+=2){
        if(i+1>=argc)return 2;wchar_t* end=nullptr;unsigned long value=wcstoul(argv[i+1],&end,10);
        if(!value||!end||*end!=L'\0')return 2;
        if(wcscmp(argv[i],L"--parent-pid")==0)parentPid=value;else if(wcscmp(argv[i],L"--ignore-pid")==0)ignoredPid=value;else return 2;
    }
    if(!parentPid||parentPid==GetCurrentProcessId())return 2;
    HANDLE parent=OpenProcess(SYNCHRONIZE,FALSE,parentPid);if(!parent)return 0;
    if(WaitForSingleObject(parent,0)!=WAIT_TIMEOUT)return 0;
    HANDLE watcher=CreateThread(nullptr,0,watchParent,parent,0,nullptr);if(!watcher){CloseHandle(parent);return 3;}CloseHandle(watcher);
    auto setDpi=reinterpret_cast<BOOL(WINAPI*)(HANDLE)>(GetProcAddress(GetModuleHandleW(L"user32.dll"),"SetProcessDpiAwarenessContext"));
    if(!setDpi||!setDpi(reinterpret_cast<HANDLE>(-4)))SetProcessDPIAware();
    HRESULT initialized=CoInitializeEx(nullptr,COINIT_MULTITHREADED);if(FAILED(initialized)){emit("unavailable",{},"com-initialization-failed");return 4;}
    {
        Com<IUIAutomation> uia;
        for(;;){const auto started=GetTickCount64();
            if(!uia){
                HRESULT created=CoCreateInstance(CLSID_CUIAutomation8,nullptr,CLSCTX_INPROC_SERVER,IID_IUIAutomation,reinterpret_cast<void**>(uia.out()));
                if(FAILED(created))CoCreateInstance(CLSID_CUIAutomation,nullptr,CLSCTX_INPROC_SERVER,IID_IUIAutomation,reinterpret_cast<void**>(uia.out()));
                if(uia){Com<IUIAutomation2> extended;if(SUCCEEDED(uia->QueryInterface(IID_IUIAutomation2,reinterpret_cast<void**>(extended.out())))){extended->put_ConnectionTimeout(500);extended->put_TransactionTimeout(600);extended->put_AutoSetFocus(FALSE);}}
            }
            std::vector<Icon> icons;
            if(uia&&scan(uia.value,icons))emit("ready",icons);
            else{emit("unavailable",{},"desktop-provider-unavailable");if(uia.value){uia.value->Release();uia.value=nullptr;}}
            const auto elapsed=GetTickCount64()-started;
            if(WaitForSingleObject(parent,elapsed<900?static_cast<DWORD>(900-elapsed):100)!=WAIT_TIMEOUT)break;
        }
    }CoUninitialize();return 0;
}
